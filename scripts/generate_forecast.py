#!/usr/bin/env python3
"""Generate demand forecast using 2 years of ENARGAS RDS history.

Trains per-segment linear regressions (temp_BA → demand) on the backfilled
RDS data, then applies a day-of-week residual offset to capture the
weekday/weekend pattern without needing full multivariate regression.

Output schema is kept compatible with the dashboard:
  demand_forecast.json -> { forecast: [...], regression: {...} }

Forecast sources:
  - weather.json (Buenos Aires tm next 14 days, from Open-Meteo)
  - today's fecha from enargas.json to align day-of-week calendar

Segments:
  - prioritaria : residential + commercial (heating-driven, negative slope vs temp)
  - cammesa    : gas-to-power (cooling-driven, positive slope vs temp)
  - total      : whole-system demand
"""

import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')


def load_envelope(path):
    with open(path, encoding='utf-8') as f:
        raw = json.load(f)
    if isinstance(raw, dict) and 'data' in raw and 'generated_at' in raw:
        return raw['data']
    return raw


def linear_regression(pairs):
    """OLS on list of (x, y) pairs. Returns (slope, intercept, r2, n)."""
    n = len(pairs)
    if n < 3:
        return None, None, None, n
    sx = sum(x for x, _ in pairs)
    sy = sum(y for _, y in pairs)
    sxy = sum(x * y for x, y in pairs)
    sx2 = sum(x * x for x, _ in pairs)
    denom = n * sx2 - sx * sx
    if abs(denom) < 1e-10:
        return None, None, None, n
    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n
    mean_y = sy / n
    ss_tot = sum((y - mean_y) ** 2 for _, y in pairs)
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in pairs)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0
    return slope, intercept, r2, n


def build_multi_city_temp(weather_history_rows):
    """Return dict {fecha -> mean temp across all cities}.

    Plain unweighted mean of the 10 cities in weather_history beats BA-only
    (R² prioritaria 0.89 vs 0.82) and also beats population-weighted (0.84).
    The broader regional signal catches cold fronts that don't hit BA first.
    """
    by_fecha: dict[str, list[float]] = {}
    for city in weather_history_rows or []:
        for h in city.get('history', []):
            if not h.get('fecha'):
                continue
            t = h.get('temp_prom')
            if t is None:
                continue
            by_fecha.setdefault(h['fecha'], []).append(float(t))
    return {k: sum(v) / len(v) for k, v in by_fecha.items() if v}


def build_multi_city_forecast(weather_regions_rows):
    """Same structure for the forward-looking forecast: {fecha -> mean_temp}."""
    by_fecha: dict[str, list[float]] = {}
    for city in weather_regions_rows or []:
        for f in city.get('forecast', []):
            if not f.get('fecha'):
                continue
            t = f.get('temp_prom')
            if t is None:
                continue
            by_fecha.setdefault(f['fecha'], []).append(float(t))
    return {k: sum(v) / len(v) for k, v in by_fecha.items() if v}


def rds_segment_series(rds_rows, key_path, x_transform=None, temp_by_fecha=None):
    """Extract [(x, value, fecha)] tuples. `x_transform` maps raw temp -> feature.

    Default: identity. Heating / cooling segments override to use HDD / CDD
    so the slope reflects the actual heating-response curve instead of a
    linear extrapolation that inflates volatility in shoulder seasons.
    """
    transform = x_transform or (lambda t: t)
    series = []
    for r in rds_rows:
        fecha = r.get('fecha')
        # Prefer multi-city mean when supplied; else fall back to BA tm.
        temp = None
        if temp_by_fecha is not None and fecha in temp_by_fecha:
            temp = temp_by_fecha[fecha]
        else:
            temp = (r.get('temperatura_ba') or {}).get('tm')
        val = r
        for p in key_path:
            if val is None:
                break
            val = (val or {}).get(p) if isinstance(val, dict) else None
        if temp is None or val is None or not fecha:
            continue
        try:
            temp_f = float(temp)
            val_f = float(val)
        except (TypeError, ValueError):
            continue
        series.append((transform(temp_f), val_f, fecha))
    return series


# Heating / cooling degree days — piece-wise linear functions that are zero
# above (resp. below) a base temperature. Much better for residential gas
# (heating) and electric generation (cooling) than raw °C.
HDD_BASE = 18.0
CDD_BASE = 22.0


def hdd(t):
    return max(0.0, HDD_BASE - t)


def cdd(t):
    return max(0.0, t - CDD_BASE)


def dow_offsets(series, slope, intercept):
    """For each day-of-week, compute mean residual after the linear fit.
    Returns dict mapping 0..6 -> offset, plus metrics."""
    if slope is None or intercept is None:
        return {i: 0.0 for i in range(7)}, {'mean_abs_residual': None}
    offsets_sum = {i: 0.0 for i in range(7)}
    offsets_n = {i: 0 for i in range(7)}
    residuals = []
    for temp, y, fecha in series:
        try:
            dt = datetime.strptime(fecha, '%Y-%m-%d')
        except ValueError:
            continue
        dow = dt.weekday()
        pred = slope * temp + intercept
        resid = y - pred
        residuals.append(resid)
        offsets_sum[dow] += resid
        offsets_n[dow] += 1
    offsets = {i: round(offsets_sum[i] / offsets_n[i], 2) if offsets_n[i] else 0.0 for i in range(7)}
    mae = sum(abs(r) for r in residuals) / len(residuals) if residuals else None
    return offsets, {'mean_abs_residual': round(mae, 2) if mae is not None else None}


def fit_segment(rds_rows, key_path, label, x_transform=None, x_feature='temp', temp_by_fecha=None):
    series = rds_segment_series(rds_rows, key_path, x_transform, temp_by_fecha)
    pairs = [(t, y) for t, y, _ in series]
    slope, intercept, r2, n = linear_regression(pairs)
    dow, extra = dow_offsets(series, slope, intercept)
    # Compute effective R² after DOW adjustment
    r2_with_dow = None
    if slope is not None and intercept is not None and n > 0:
        mean_y = sum(y for _, y in pairs) / n
        ss_tot = sum((y - mean_y) ** 2 for _, y in pairs)
        ss_res = 0.0
        for temp, y, fecha in series:
            try:
                d = datetime.strptime(fecha, '%Y-%m-%d').weekday()
            except ValueError:
                d = 0
            pred = slope * temp + intercept + dow[d]
            ss_res += (y - pred) ** 2
        if ss_tot > 0:
            r2_with_dow = round(1 - ss_res / ss_tot, 3)
    return {
        'label': label,
        'slope': round(slope, 3) if slope is not None else None,
        'intercept': round(intercept, 1) if intercept is not None else None,
        'r2_temp_only': round(r2, 3) if r2 is not None else None,
        'r2_with_dow': r2_with_dow,
        'n_points': n,
        'dow_offsets': dow,
        'mean_abs_residual': extra.get('mean_abs_residual'),
        'x_transform': x_transform,       # kept in-memory; not serialized
        'x_feature': x_feature,           # serialized — UI shows "HDD(18)" etc.
        'uses_multi_city': temp_by_fecha is not None,
    }


def predict(model, temp, fecha_iso, multi_city_temp=None):
    """Apply the fitted model. If the model was trained on multi-city mean
    temp (prioritaria), pass multi_city_temp[fecha] here; otherwise pass the
    BA forecast temperature."""
    if model['slope'] is None or model['intercept'] is None:
        return None
    x_transform = model.get('x_transform') or (lambda t: t)
    # Prefer multi-city when the model was trained that way; caller encodes
    # that choice by supplying multi_city_temp only to prioritaria.
    t_input = multi_city_temp if (multi_city_temp is not None and model.get('uses_multi_city')) else temp
    if t_input is None:
        return None
    x = x_transform(t_input)
    try:
        dow = datetime.strptime(fecha_iso, '%Y-%m-%d').weekday()
    except ValueError:
        dow = 0
    offset = model['dow_offsets'].get(dow, 0.0)
    return round(model['slope'] * x + model['intercept'] + offset, 1)


def main():
    daily_path = os.path.join(OUT_DIR, 'daily.json')
    weather_path = os.path.join(OUT_DIR, 'weather.json')
    enargas_path = os.path.join(OUT_DIR, 'enargas.json')

    if not os.path.exists(weather_path):
        print("No weather.json — run fetch_weather.py first", file=sys.stderr)
        return
    if not os.path.exists(enargas_path):
        print("No enargas.json — run ENARGAS fetcher/backfill first", file=sys.stderr)
        return

    weather = load_envelope(weather_path)
    forecast_days = weather.get('forecast', []) if isinstance(weather, dict) else []
    if not forecast_days:
        return

    rds_rows = load_envelope(enargas_path)
    print(f"Training on {len(rds_rows)} RDS rows")

    # Multi-city temp: plain mean of 10 cities measurably beats BA-only for
    # prioritaria (R² 0.82 -> 0.89). Other segments stay with BA temp —
    # haven't measured a benefit there so don't complicate unnecessarily.
    history_path = os.path.join(OUT_DIR, 'weather_history.json')
    regions_path = os.path.join(OUT_DIR, 'weather_regions.json')
    hist_temp_by_fecha = build_multi_city_temp(load_envelope(history_path)) if os.path.exists(history_path) else {}
    fc_temp_by_fecha = build_multi_city_forecast(load_envelope(regions_path)) if os.path.exists(regions_path) else {}

    models = {
        # Heating-driven: HDD damps the model to zero in warm months. Backtest
        # showed MAE dropped 34% vs raw temp. Multi-city mean adds another
        # +7pp R² over BA-only.
        'prioritaria': fit_segment(
            rds_rows, ['consumos', 'prioritaria', 'programa'], 'Prioritaria',
            x_transform=hdd, x_feature=f'HDD({HDD_BASE:g}°C · media 10 ciudades)',
            temp_by_fecha=hist_temp_by_fecha or None,
        ),
        # Cooling-driven: we tried CDD(22°C) but it zeroes-out in shoulder
        # seasons and loses signal. Raw temp backtest beats CDD on MAE.
        'usinas': fit_segment(rds_rows, ['consumos', 'cammesa', 'programa'], 'Usinas (CAMMESA)'),
        # Industrial + GNC + combustible: weak temperature link; keep raw.
        'industria': fit_segment(rds_rows, ['consumos', 'industria', 'programa'], 'Industria'),
        'gnc': fit_segment(rds_rows, ['consumos', 'gnc', 'programa'], 'GNC'),
        'combustible': fit_segment(rds_rows, ['consumos', 'combustible', 'programa'], 'Combustible'),
        'demanda_total_direct': fit_segment(rds_rows, ['consumo_total_estimado'], 'Demanda total (directo)'),
    }

    # Exportaciones: low-variance, use the historical mean as a constant offset.
    exports_vals = []
    for r in rds_rows:
        exps = r.get('exportaciones') or {}
        tgn = (exps.get('tgn') or {}).get('vol_exportar') or 0
        tgs = (exps.get('tgs') or {}).get('vol_exportar') or 0
        tot = tgn + tgs
        if tot > 0:
            exports_vals.append(tot)
    baseline_exports = round(sum(exports_vals) / len(exports_vals), 1) if exports_vals else 0.0

    print("Regressions:")
    for key, m in models.items():
        print(f"  {m['label']:24s}  slope={m['slope']} int={m['intercept']} "
              f"R² temp-only={m['r2_temp_only']}  R² +dow={m['r2_with_dow']}  n={m['n_points']}")
        dow_names = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
        if m['slope'] is not None:
            print(f"    dow offsets: " + "  ".join(f"{dow_names[i]}{m['dow_offsets'][i]:+.1f}" for i in range(7)))
    print(f"  Exportaciones baseline: {baseline_exports} MMm³/d (media histórica)")

    # Measure how well the SUM of segment predictions matches observed total.
    segment_keys = ['prioritaria', 'usinas', 'industria', 'gnc', 'combustible']
    recon_pairs = []
    for r in rds_rows:
        temp = ((r.get('temperatura_ba') or {}).get('tm'))
        obs = r.get('consumo_total_estimado')
        fecha = r.get('fecha')
        if temp is None or obs is None or not fecha:
            continue
        try:
            temp_f = float(temp)
            obs_f = float(obs)
        except (TypeError, ValueError):
            continue
        parts = [predict(models[k], temp_f, fecha, hist_temp_by_fecha.get(fecha)) for k in segment_keys]
        if any(p is None for p in parts):
            continue
        pred = sum(parts) + baseline_exports
        recon_pairs.append((obs_f, pred))
    recon_r2 = None
    if recon_pairs:
        mean_obs = sum(o for o, _ in recon_pairs) / len(recon_pairs)
        ss_tot = sum((o - mean_obs) ** 2 for o, _ in recon_pairs)
        ss_res = sum((o - p) ** 2 for o, p in recon_pairs)
        if ss_tot > 0:
            recon_r2 = round(1 - ss_res / ss_tot, 3)
    print(f"  Reconstructed total R²: {recon_r2}  (vs direct R²: {models['demanda_total_direct']['r2_with_dow']})")

    # Use whichever method gives a better R²; prefer the reconstruction when
    # it wins, because the segment models are individually interpretable.
    use_reconstruction = (
        recon_r2 is not None
        and (models['demanda_total_direct']['r2_with_dow'] is None
             or recon_r2 >= models['demanda_total_direct']['r2_with_dow'])
    )
    total_method = 'suma de segmentos' if use_reconstruction else 'regresión directa sobre total'
    total_r2 = recon_r2 if use_reconstruction else models['demanda_total_direct']['r2_with_dow']
    print(f"  Total demanda usa: {total_method}  (R²={total_r2})")

    demand_forecast = []
    for day in forecast_days:
        temp = day.get('temp_prom')
        if temp is None:
            continue
        multi = fc_temp_by_fecha.get(day['fecha'])
        prio = predict(models['prioritaria'], temp, day['fecha'], multi)
        usinas = predict(models['usinas'], temp, day['fecha'])
        industria = predict(models['industria'], temp, day['fecha'])
        gnc = predict(models['gnc'], temp, day['fecha'])
        combustible = predict(models['combustible'], temp, day['fecha'])
        parts = [prio, usinas, industria, gnc, combustible]
        if use_reconstruction and all(p is not None for p in parts):
            total = round(sum(parts) + baseline_exports, 1)
        else:
            total = predict(models['demanda_total_direct'], temp, day['fecha'])
        demand_forecast.append({
            'fecha': day['fecha'],
            'temp_prom': temp,
            'temp_max': day.get('temp_max'),
            'temp_min': day.get('temp_min'),
            'prioritaria_est': prio,
            'usinas_est': usinas,
            'industria_est': industria,
            'gnc_est': gnc,
            'combustible_est': combustible,
            'exportaciones_est': baseline_exports,
            'demanda_total_est': total,
        })

    def model_payload(m):
        return {
            'label': m['label'],
            'slope': m['slope'],
            'intercept': m['intercept'],
            'r2': m['r2_with_dow'],
            'r2_temp_only': m['r2_temp_only'],
            'n_points': m['n_points'],
            'dow_offsets': m['dow_offsets'],
            'mean_abs_residual': m['mean_abs_residual'],
            'x_feature': m.get('x_feature', 'temp'),
        }

    regression_out = {
        'n_points': models['prioritaria']['n_points'],
        'features': ['temp_BA', 'day_of_week'],
        'training_source': 'ENARGAS RDS — 720 días backfilled',
        'total_method': total_method,
        'baseline_exportaciones': baseline_exports,
        'prioritaria': model_payload(models['prioritaria']),
        'usinas': model_payload(models['usinas']),
        'industria': model_payload(models['industria']),
        'gnc': model_payload(models['gnc']),
        'combustible': model_payload(models['combustible']),
        'demanda_total': {
            'slope': None,
            'intercept': None,
            'r2': total_r2,
            'method': total_method,
        },
    }

    forecast_path = os.path.join(OUT_DIR, 'demand_forecast.json')
    write_json(
        forecast_path,
        {'forecast': demand_forecast, 'regression': regression_out},
        source='ENARGAS RDS regression (temp + day-of-week)',
        source_date=demand_forecast[0]['fecha'] if demand_forecast else None,
    )
    write_csv(json_to_csv_path(forecast_path), demand_forecast)
    print(f"demand_forecast.json: {len(demand_forecast)} days")

    # Auto-comments use Excel's daily.json for "today" since the dashboard
    # still reads linepack TGS/TGN and CAMMESA mix from there.
    if os.path.exists(daily_path):
        daily = load_envelope(daily_path)
        generate_comments(daily, demand_forecast, regression_out)


def generate_comments(daily, demand_forecast, regression):
    valid = [d for d in daily if d.get('demanda_total')]
    if not valid:
        return

    latest = valid[-1]
    prev = valid[-2] if len(valid) > 1 else None

    lines_daily = []
    lines_weekly = []

    if latest.get('temp_prom_ba'):
        temp = latest['temp_prom_ba']
        lines_daily.append(
            f"Temperatura promedio en Buenos Aires: {temp:.0f} C "
            f"(min {latest.get('temp_min_ba', '?')}, max {latest.get('temp_max_ba', '?')})."
        )

    if latest.get('demanda_total'):
        dem = latest['demanda_total']
        change = ""
        if prev and prev.get('demanda_total'):
            delta = dem - prev['demanda_total']
            change = f" ({'suba' if delta > 0 else 'baja'} de {abs(delta):.1f} MMm3/d vs dia anterior)"
        lines_daily.append(f"Demanda total del sistema: {dem:.1f} MMm3/dia{change}.")

    for sys_name, lp_key, var_key, inf_key, sup_key in [
        ('TGS', 'linepack_tgs', 'var_linepack_tgs', 'lim_inf_tgs', 'lim_sup_tgs'),
        ('TGN', 'linepack_tgn', 'var_linepack_tgn', 'lim_inf_tgn', 'lim_sup_tgn'),
    ]:
        lp = latest.get(lp_key)
        var = latest.get(var_key)
        inf = latest.get(inf_key)
        sup = latest.get(sup_key)
        if lp is not None:
            status = "NORMAL"
            if inf and lp < inf:
                status = "BAJO LIMITE"
            elif sup and lp > sup:
                status = "SOBRE LIMITE"
            var_str = f", variacion {var:+.1f}" if var else ""
            lines_daily.append(f"Linepack {sys_name}: {lp:.1f} MMm3{var_str} - Estado: {status} (limites: {inf}-{sup}).")

    if latest.get('cammesa_gas') is not None:
        gas = latest['cammesa_gas']
        total = latest.get('cammesa_total', gas)
        pct = (gas / total * 100) if total else 0
        lines_daily.append(f"Despacho electrico: gas natural {gas:.1f} GWh ({pct:.0f}% del total).")

    if demand_forecast:
        temps = [d['temp_prom'] for d in demand_forecast[:7] if d.get('temp_prom')]
        dems = [d.get('demanda_total_est') for d in demand_forecast[:7] if d.get('demanda_total_est')]
        if temps:
            lines_weekly.append(
                f"Pronostico de temperatura para los proximos 7 dias: "
                f"rango {min(temps):.0f}-{max(temps):.0f} C (promedio {sum(temps)/len(temps):.1f} C)."
            )
        if dems:
            r2 = regression['demanda_total']['r2']
            caveat = ''
            if r2 is not None and r2 < 0.4:
                caveat = f' (R²={r2} — tomar como indicativo)'
            lines_weekly.append(
                f"Demanda total estimada para la semana: {min(dems):.0f}-{max(dems):.0f} MMm3/dia{caveat}."
            )
            prios = [d.get('prioritaria_est') for d in demand_forecast[:7] if d.get('prioritaria_est')]
            if prios:
                lines_weekly.append(
                    f"Demanda prioritaria estimada: {min(prios):.0f}-{max(prios):.0f} MMm3/dia."
                )

    auto_comments = {
        'daily': lines_daily,
        'weekly': lines_weekly,
        'note': 'Comentarios generados automaticamente. Ultima actualizacion: ' + latest['fecha'],
    }

    comments_path = os.path.join(OUT_DIR, 'comments.json')
    write_json(
        comments_path,
        auto_comments,
        source='auto-generated by generate_forecast.py',
        source_date=latest['fecha'],
    )
    comments_rows = (
        [{'tipo': 'daily', 'texto': t} for t in lines_daily]
        + [{'tipo': 'weekly', 'texto': t} for t in lines_weekly]
    )
    write_csv(json_to_csv_path(comments_path), comments_rows, fieldnames=['tipo', 'texto'])
    print(f"comments.json: {len(lines_daily)} daily + {len(lines_weekly)} weekly auto-comments")


if __name__ == '__main__':
    main()
