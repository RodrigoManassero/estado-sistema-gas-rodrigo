#!/usr/bin/env python3
"""Forecast de linepack TGN/TGS/total + relleno de huecos.

El linepack es un STOCK regulado: el sistema lo mantiene cerca de un nivel de
operación y revierte hacia él. Los datos de variación diaria (Δ) son escasos y
ruidosos (p.ej. `var_linepack_tgn` ~8 puntos útiles, con saltos espurios de
cientos de MMm³ en bordes de backfill), así que una regresión Δ~temperatura es
inviable y diverge al integrar. Por parsimonia (medir antes de shippear), se
usa un modelo de NIVELES robusto:

    nivel[t] = nivel[t-1] + k · (media_reciente − nivel[t-1])

— reversión a la media reciente, con el factor k ∈ {0, …} elegido por backtest
out-of-sample (k=0 es persistencia pura). No puede divergir y sirve tanto para
la proyección a futuro como para el relleno de "hoy"/fin de semana cuando falta
el dato (marcado "(est.)" en la UI).

Salida: linepack_forecast.json (SEPARADO de daily.json para no crear una
dependencia circular: el modelo lee daily.json).
"""

import os
import sys
from datetime import datetime, timedelta

# Windows: la consola es cp1252; forzamos utf-8 para los prints con acentos.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402
from generate_forecast import load_envelope  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')

# (nombre, campo de nivel en daily.json)
SYSTEMS = [
    ('total', 'linepack_total'),
    ('tgn', 'linepack_tgn'),
    ('tgs', 'linepack_tgs'),
]
HORIZONS = [1, 3, 7, 14]
K_GRID = [0.0, 0.05, 0.1, 0.15, 0.2, 0.3]   # 0 = persistencia
TARGET_WINDOW = 14                          # días para la media reciente
BACKTEST_DAYS = 60


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def levels_by_date(daily, lp_key):
    out = {}
    for r in daily:
        f = r.get('fecha')
        v = _f(r.get(lp_key))
        if f and v is not None:
            out[f] = v
    return out


def recent_mean(levels, upto_date, window=TARGET_WINDOW):
    ds = [d for d in sorted(levels) if d <= upto_date][-window:]
    if not ds:
        return None
    return sum(levels[d] for d in ds) / len(ds)


def revert(level, target, k, ndays):
    """Niveles para t=1..ndays revirtiendo a `target` con factor k."""
    out = []
    for _ in range(ndays):
        level = level + k * (target - level)
        out.append(round(level, 2))
    return out


def backtest_k(levels, k):
    """MAE del nivel por horizonte (out-of-sample sobre los últimos
    BACKTEST_DAYS) para un factor de reversión k dado."""
    dates = sorted(levels)
    if len(dates) < BACKTEST_DAYS + TARGET_WINDOW:
        return None
    split = dates[-BACKTEST_DAYS]
    errs = {h: [] for h in HORIZONS}
    for origin in dates:
        if origin < split:
            continue
        target = recent_mean(levels, origin)
        if target is None:
            continue
        o = datetime.strptime(origin, '%Y-%m-%d').date()
        for h in HORIZONS:
            tgt_date = (o + timedelta(days=h)).isoformat()
            if tgt_date not in levels:
                continue
            pred = revert(levels[origin], target, k, h)[-1]
            errs[h].append(abs(pred - levels[tgt_date]))
    out = {}
    for h in HORIZONS:
        if errs[h]:
            out[str(h)] = round(sum(errs[h]) / len(errs[h]), 2)
    return out or None


def choose_k(levels):
    """Elige el k que minimiza el MAE promedio sobre los horizontes."""
    best = None
    grid = {}
    for k in K_GRID:
        bt = backtest_k(levels, k)
        if not bt:
            continue
        grid[k] = bt
        score = sum(bt.values()) / len(bt)
        if best is None or score < best['score']:
            best = {'k': k, 'score': round(score, 3), 'mae_by_horizon': bt}
    if best is None:
        return None
    best['persistence_mae'] = grid.get(0.0)   # referencia k=0 para transparencia
    return best


def _daterange(start_iso, end_iso):
    d = datetime.strptime(start_iso, '%Y-%m-%d').date()
    end = datetime.strptime(end_iso, '%Y-%m-%d').date()
    while d <= end:
        yield d.isoformat()
        d += timedelta(days=1)


def main():
    daily_path = os.path.join(OUT_DIR, 'daily.json')
    weather_path = os.path.join(OUT_DIR, 'weather.json')
    if not os.path.exists(daily_path):
        print('No daily.json — correr build_daily.py primero', file=sys.stderr)
        return 1
    daily = load_envelope(daily_path)
    weather = load_envelope(weather_path) if os.path.exists(weather_path) else {}
    forecast_days = weather.get('forecast', []) if isinstance(weather, dict) else []
    if not forecast_days:
        print('weather.json sin forecast — nada que proyectar', file=sys.stderr)
        return 1
    last_fc = forecast_days[-1].get('fecha')
    temp_by_date = {d['fecha']: d.get('temp_prom')
                    for d in forecast_days if d.get('fecha')}

    backtests, anchors, chosen_k, targets = {}, {}, {}, {}
    series = {}
    for name, lp_key in SYSTEMS:
        levels = levels_by_date(daily, lp_key)
        series[name] = levels
        af = max(levels) if levels else None
        anchors[name] = {'fecha': af, 'level': levels[af] if af else None}
        bt = choose_k(levels)
        backtests[name] = bt
        chosen_k[name] = bt['k'] if bt else 0.0
        targets[name] = recent_mean(levels, af) if af else None

    # Integración por sistema: del día siguiente a su ancla hasta el último día
    # del pronóstico de clima, revirtiendo a la media reciente con el k elegido.
    est_by_date = {}
    for name, lp_key in SYSTEMS:
        a = anchors[name]
        tgt = targets[name]
        if a['fecha'] is None or a['level'] is None or tgt is None or last_fc is None:
            continue
        start = (datetime.strptime(a['fecha'], '%Y-%m-%d').date() + timedelta(days=1)).isoformat()
        if start > last_fc:
            continue
        lvl = a['level']
        for fecha in _daterange(start, last_fc):
            lvl = round(lvl + chosen_k[name] * (tgt - lvl), 2)
            slot = est_by_date.setdefault(fecha, {'fecha': fecha})
            slot[f'linepack_{name}_est'] = lvl
            if fecha in temp_by_date and temp_by_date[fecha] is not None:
                slot['temp_prom'] = temp_by_date[fecha]
    forecast = [est_by_date[f] for f in sorted(est_by_date)]

    payload = {
        'forecast': forecast,
        'model': {
            'method': 'reversión a la media reciente del nivel',
            'formula': 'nivel[t] = nivel[t-1] + k·(media_14d − nivel[t-1])',
            'target_window_days': TARGET_WINDOW,
            'note': ('Δ linepack es muy ralo/ruidoso para una regresión '
                     'temp→Δ; k se elige por backtest (k=0 = persistencia).'),
            'k': {name: chosen_k[name] for name, _ in SYSTEMS},
            'target_recent_mean': {name: (round(targets[name], 2) if targets[name] else None)
                                   for name, _ in SYSTEMS},
        },
        'backtest': {name: backtests[name] for name, _ in SYSTEMS},
        'anchor': {name: anchors[name] for name, _ in SYSTEMS},
    }

    out_path = os.path.join(OUT_DIR, 'linepack_forecast.json')
    write_json(
        out_path, payload,
        source='Reversión a la media del nivel (k por backtest)',
        source_date=forecast[0]['fecha'] if forecast else None,
    )
    write_csv(json_to_csv_path(out_path), forecast)

    for name, _ in SYSTEMS:
        bt = backtests[name]
        if bt:
            mae = bt['mae_by_horizon']
            mae_str = '  '.join(f'{h}d={mae[h]}' for h in ('1', '3', '7', '14') if h in mae)
            print(f"  linepack {name:5s}  k={bt['k']}  MAE niveles: {mae_str}  "
                  f"(n ancla={len(series[name])})")
        else:
            print(f"  linepack {name:5s}  sin backtest (pocos puntos: "
                  f"{len(series[name])})")
    print(f"linepack_forecast.json: {len(forecast)} días "
          f"({forecast[0]['fecha'] if forecast else '-'} -> {last_fc})")
    return 0


if __name__ == '__main__':
    sys.exit(main())
