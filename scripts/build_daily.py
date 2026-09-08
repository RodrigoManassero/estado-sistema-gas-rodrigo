#!/usr/bin/env python3
"""Build daily.json from the automatic sources (the merge, in Python).

This replaces the manual Excel (parse_base_excel.py) as the producer of
daily.json. The Excel-era manual rows are frozen once in daily_history.json
(linepack TGN/TGS limits, Esquel temps, etc. for the handful of days the analyst
maintained by hand); this script loads that snapshot and upserts every automatic
feed on top, creating a row per date and filling only the holes — a value already
present always wins. It is the exact precedence the frontend used to apply at
render time in src/utils/mergeDaily.ts, moved into the pipeline so daily.json is
self-sufficient and the Excel can be retired.

Fill priority (first source to fill a hole wins):
  - PS  (enargas_ps.json): the authority for linepack TGN/TGS/total + Min/Max
        límites, system delta, tramos finales, ENARSA/GPFM, Buque Escobar,
        Bolivia, plus demand-by-segment and injection totals. This is what makes
        the TGN linepack current again (the Excel had no automatic refill).
  - RDS (enargas.json): demand by segment, temperature, linepack total.
  - ING (enargas_ing.json, tipo R): per-system injection (TGS/TGN/total).
  - ETGS (etgs.json): TGS linepack stock + variation.
  - PPO (cammesa_ppo.json): CAMMESA fuel-gas consumption.
"""

import json
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
DAILY_JSON = os.path.join(OUT_DIR, 'daily.json')
HISTORY_JSON = os.path.join(OUT_DIR, 'daily_history.json')


def _load(name):
    path = os.path.join(OUT_DIR, name)
    if not os.path.exists(path):
        return [], None
    with open(path, encoding='utf-8') as f:
        raw = json.load(f)
    if isinstance(raw, dict):
        return raw.get('data') or [], raw
    return raw or [], None


def fill(cur, cand):
    """Source fills only when daily has no value yet."""
    return cur if cur is not None else cand


def fillz(cur, cand):
    """Like fill, but treat 0 as missing — several Excel columns carry 0.0 for a
    half-completed row (the parser's zero-as-null flag is off for them)."""
    return cur if (cur is not None and cur != 0) else cand


def _get(d, *path):
    for k in path:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


# --- Combustibles: a MMm³ de gas equivalente ------------------------------
# CAMMESA reporta cada combustible en su unidad nativa (gas en MMm³, fueloil y
# carbón en Tn, gasoil en m³). Para apilarlos con el gas en el mismo eje los
# pasamos a MMm³ de gas natural equivalente por poder calorífico. Gas natural
# argentino: m³ de 9300 kcal. Factores documentados (parsimonia); calibrar
# contra el "Consumo ponderado por Poder Calorífico" que publica CAMMESA si el
# apilado no coincide con su referencia.
# NOTA: el gasoil del PPO (Parte) aparece en una escala mucho menor que el
# reporte "Estimación de Consumos Totales" del analista — validar contra dato
# fresco antes de confiar en la barra de gasoil cerrado.
GAS_KCAL_M3 = 9300
FUEL_KCAL = {
    'gasoil_m3': 9.08e6,    # ~0.845 t/m³ · 10750 kcal/kg
    'fueloil_tn': 9.6e6,    # 9600 kcal/kg · 1000 kg/t
    'carbon_tn': 6.0e6,     # 6000 kcal/kg · 1000 kg/t
}

# Tolerancia ABII del desbalance TGN: ±7% → fuera de banda = sistema en ALERTA.
TGN_TOLERANCIA_PCT = 7.0


def _gas_equiv_mmm3(qty, kcal_per_unit):
    """Convierte una cantidad de combustible (en su unidad nativa) a MMm³ de
    gas natural equivalente por contenido calorífico."""
    if qty is None:
        return None
    return round(qty * kcal_per_unit / (GAS_KCAL_M3 * 1_000_000), 3)


def _to_float(s):
    """Parsea '1.9' / '7,19' / None a float de forma robusta (o None)."""
    if s is None:
        return None
    try:
        return float(str(s).replace(',', '.').strip())
    except (TypeError, ValueError):
        return None


def _spread_miles(value, ndays):
    """Reparte un total semanal expresado en 'miles' (de t o de m³) entre los
    días de la semana → cantidad en unidad nativa por día."""
    if value is None or not ndays:
        return None
    return value * 1000.0 / ndays


def main():
    history, hist_env = _load('daily_history.json')
    if not history:
        print('ERROR: daily_history.json missing or empty — cannot build daily.json',
              file=sys.stderr)
        return 1
    fields = list(history[0].keys())
    # Campos que no estaban en el Excel-era congelado pero que este script
    # produce: estado del sistema TGN y la mezcla de combustibles proyectada.
    for extra in ('estado_tgn', 'cammesa_gas_est', 'cammesa_gasoil_est',
                  'cammesa_fueloil_est', 'cammesa_carbon_est'):
        if extra not in fields:
            fields.append(extra)

    def blank(fecha):
        row = {k: None for k in fields}
        row['fecha'] = fecha
        return row

    by_date = {}
    for d in history:
        if d.get('fecha'):
            by_date[d['fecha']] = dict(d)
    # Fechas del histórico manual congelado — el cierre real (ETGS/ABII) pisa la
    # proyección de PS salvo en estas fechas, donde manda el valor a mano.
    hist_dates = {d.get('fecha') for d in history if d.get('fecha')}

    def row_for(fecha):
        r = by_date.get(fecha)
        if r is None:
            r = blank(fecha)
            by_date[fecha] = r
        return r

    rds, _ = _load('enargas.json')
    ing, _ = _load('enargas_ing.json')
    etgs, _ = _load('etgs.json')
    ppo, _ = _load('cammesa_ppo.json')
    ps, _ = _load('enargas_ps.json')

    # PS — authority for linepack TGN/TGS/total + límites + tramos finales +
    # ENARSA/GPFM/Escobar/Bolivia, also demand & injection.
    for r in ps:
        f = r.get('fecha')
        if not f:
            continue
        row = row_for(f)
        row['demanda_total'] = fill(row['demanda_total'], r.get('demanda_total'))
        row['prioritaria'] = fill(row['prioritaria'], r.get('prioritaria'))
        row['usinas'] = fillz(row['usinas'], r.get('usinas'))
        row['industria'] = fillz(row['industria'], r.get('industria'))
        exp = None
        if r.get('exp_tgn') is not None or r.get('exp_tgs') is not None:
            exp = (r.get('exp_tgn') or 0) + (r.get('exp_tgs') or 0)
        row['exportaciones'] = fillz(row['exportaciones'], exp)
        row['iny_tgs'] = fillz(row['iny_tgs'], r.get('iny_tgs'))
        row['iny_tgn'] = fillz(row['iny_tgn'], r.get('iny_tgn'))
        row['iny_total'] = fillz(row['iny_total'], r.get('iny_total'))
        row['iny_enarsa'] = fill(row['iny_enarsa'], r.get('iny_enarsa'))
        row['iny_gpm'] = fill(row['iny_gpm'], r.get('iny_gpm'))
        row['iny_bolivia'] = fill(row['iny_bolivia'], r.get('iny_bolivia'))
        row['iny_escobar'] = fill(row['iny_escobar'], r.get('iny_escobar'))
        row['temp_prom_ba'] = fill(row['temp_prom_ba'], r.get('temp_prom_ba'))
        row['linepack_total'] = fill(row['linepack_total'], r.get('linepack_total'))
        row['var_linepack_total'] = fill(row['var_linepack_total'], r.get('var_linepack_total'))
        row['lim_inf_total'] = fill(row['lim_inf_total'], r.get('lim_inf_total'))
        row['lim_sup_total'] = fill(row['lim_sup_total'], r.get('lim_sup_total'))
        row['linepack_tgs'] = fill(row['linepack_tgs'], r.get('linepack_tgs'))
        row['lim_inf_tgs'] = fill(row['lim_inf_tgs'], r.get('lim_inf_tgs'))
        row['lim_sup_tgs'] = fill(row['lim_sup_tgs'], r.get('lim_sup_tgs'))
        row['linepack_tgn'] = fill(row['linepack_tgn'], r.get('linepack_tgn'))
        row['lim_inf_tgn'] = fill(row['lim_inf_tgn'], r.get('lim_inf_tgn'))
        row['lim_sup_tgn'] = fill(row['lim_sup_tgn'], r.get('lim_sup_tgn'))
        row['tramo_final_tgs'] = fill(row['tramo_final_tgs'], r.get('tramo_final_tgs'))
        row['tramo_final_tgn'] = fill(row['tramo_final_tgn'], r.get('tramo_final_tgn'))

    # RDS — demand by sector + linepack_total + temperature.
    for r in rds:
        f = r.get('fecha')
        if not f:
            continue
        row = row_for(f)
        exps = r.get('exportaciones') or {}
        exp_total = None
        tgn, tgs = _get(exps, 'tgn', 'vol_exportar'), _get(exps, 'tgs', 'vol_exportar')
        if tgn is not None or tgs is not None:
            exp_total = (tgn or 0) + (tgs or 0)
        row['demanda_total'] = fill(row['demanda_total'], r.get('consumo_total_estimado'))
        row['prioritaria'] = fill(row['prioritaria'], _get(r, 'consumos', 'prioritaria', 'programa'))
        row['usinas'] = fillz(row['usinas'], _get(r, 'consumos', 'cammesa', 'programa'))
        row['industria'] = fillz(row['industria'], _get(r, 'consumos', 'industria', 'programa'))
        row['exportaciones'] = fillz(row['exportaciones'], exp_total)
        row['temp_prom_ba'] = fill(row['temp_prom_ba'], _get(r, 'temperatura_ba', 'tm'))
        row['temp_min_ba'] = fill(row['temp_min_ba'], _get(r, 'temperatura_ba', 'min'))
        row['temp_max_ba'] = fill(row['temp_max_ba'], _get(r, 'temperatura_ba', 'max'))
        row['linepack_total'] = fill(row['linepack_total'], r.get('linepack_total'))

    # ING — per-gasoducto injection; only "R" (real) rows for historical fill.
    for r in ing:
        f = r.get('fecha')
        if not f or r.get('tipo') != 'R':
            continue
        row = row_for(f)
        row['iny_tgs'] = fillz(row['iny_tgs'], r.get('tgs'))
        row['iny_tgn'] = fillz(row['iny_tgn'], r.get('tgn'))
        row['iny_total'] = fillz(row['iny_total'], r.get('total'))

    # ETGS — real TGS linepack stock (the only daily source that carries it).
    # El cierre real PISA la proyección de PS (que llenó antes con fill): si no,
    # el día queda "pegado" al valor proyectado y muestra un linepack viejo
    # (bug del Dom 21/6 marcado por el analista). El histórico congelado a mano
    # se respeta (no está en el rango que cubre ETGS, pero por las dudas).
    for r in etgs:
        f = r.get('fecha')
        if not f:
            continue
        row = row_for(f)
        lp = r.get('linepack_tgs_dia_actual')
        if lp is not None and f not in hist_dates:
            row['linepack_tgs'] = lp
        else:
            row['linepack_tgs'] = fill(row['linepack_tgs'], lp)
        row['var_linepack_tgs'] = fill(row['var_linepack_tgs'], r.get('linepack_tgs_variacion'))

    # CAMMESA PPO — mezcla de combustibles real (dato cerrado). Gas ya viene en
    # MMm³; gasoil/fueloil/carbón se pasan a MMm³ gas-equivalente para poder
    # apilarlos con el gas. cammesa_total sigue siendo sólo gas (KPIs lo usan).
    for r in ppo:
        f = r.get('fecha')
        if not f:
            continue
        row = row_for(f)
        row['cammesa_gas'] = fillz(row['cammesa_gas'], r.get('gas_mmm3'))
        row['cammesa_gasoil'] = fillz(
            row['cammesa_gasoil'], _gas_equiv_mmm3(r.get('gasoil_m3'), FUEL_KCAL['gasoil_m3']))
        row['cammesa_fueloil'] = fillz(
            row['cammesa_fueloil'], _gas_equiv_mmm3(r.get('fueloil_tn'), FUEL_KCAL['fueloil_tn']))
        row['cammesa_carbon'] = fillz(
            row['cammesa_carbon'], _gas_equiv_mmm3(r.get('carbon_tn'), FUEL_KCAL['carbon_tn']))
        row['cammesa_total'] = fillz(row['cammesa_total'], r.get('gas_mmm3'))

    # TGN ABII — 'Actual' (m³) es el linepack TGN real del día. Igual que ETGS,
    # el cierre real PISA la proyección de PS (sino el día queda "pegado", bug
    # del Dom 21/6). Además derivamos el estado del sistema desde el desbalance
    # %: ABII marca ALERTA cuando |desb%| > 7 (tolerancia ±7 del reporte —
    # verificado: 20/6 = 7.19 → ALERTA, 21/6 = 2.16 y 22/6 = 1.9 → NORMAL).
    tgn_state, _ = _load('tgn_system_state.json')
    for r in tgn_state:
        f = r.get('fecha')
        if not f:
            continue
        actual = r.get('Actual')
        try:
            mmm3 = round(float(actual) / 1_000_000, 2) if actual not in (None, '') else None
        except (TypeError, ValueError):
            mmm3 = None
        row = row_for(f)
        if mmm3 is not None:
            if f not in hist_dates:
                row['linepack_tgn'] = mmm3
            else:
                row['linepack_tgn'] = fill(row['linepack_tgn'], mmm3)
        desb = _to_float(r.get('Desbalance porcentual'))
        if desb is not None:
            row['estado_tgn'] = 'ALERTA' if abs(desb) > TGN_TOLERANCIA_PCT else 'NORMAL'

    # --- Mezcla de combustibles PROYECTADA (CAMMESA Previsión semanal) --------
    # cammesa_weekly trae 2 semanas: el gas en MMm³/día y FO/GO/carbón como
    # TOTAL semanal en miles (verificado: carbón 24 mil t/sem ÷7 ≈ 3.4 kt/día ≈
    # PPO cerrado). Se reparte el total entre los días de la semana y se pasa a
    # MMm³ gas-equivalente para dibujar las barras proyectadas del despacho.
    # Cubre los días sin cierre (hoy/ayer, 7b) y los futuros (7c).
    cw, _ = _load('cammesa_weekly.json')
    weeks = cw.get('weeks') if isinstance(cw, dict) else None
    for w in (weeks or []):
        sd, ed = w.get('start_date'), w.get('end_date')
        if not sd or not ed:
            continue
        try:
            d0, d1 = date.fromisoformat(sd), date.fromisoformat(ed)
        except (TypeError, ValueError):
            continue
        ndays = (d1 - d0).days + 1
        if ndays <= 0:
            continue
        gas_dia = w.get('gas_mm3_dia')                          # ya MMm³/día
        go_equiv = _gas_equiv_mmm3(_spread_miles(w.get('go_miles_m3'), ndays), FUEL_KCAL['gasoil_m3'])
        fo_equiv = _gas_equiv_mmm3(_spread_miles(w.get('fo_miles_ton'), ndays), FUEL_KCAL['fueloil_tn'])
        cb_equiv = _gas_equiv_mmm3(_spread_miles(w.get('carbon_miles_ton'), ndays), FUEL_KCAL['carbon_tn'])
        for n in range(ndays):
            f = (d0 + timedelta(days=n)).isoformat()
            row = row_for(f)
            row['cammesa_gas_est'] = fill(row.get('cammesa_gas_est'),
                                          round(gas_dia, 3) if gas_dia is not None else None)
            row['cammesa_gasoil_est'] = fill(row.get('cammesa_gasoil_est'), go_equiv)
            row['cammesa_fueloil_est'] = fill(row.get('cammesa_fueloil_est'), fo_equiv)
            row['cammesa_carbon_est'] = fill(row.get('cammesa_carbon_est'), cb_equiv)

    rows = sorted(by_date.values(), key=lambda r: r.get('fecha') or '')

    # VAR TGN día-a-día: PS/ETGS traen la variación de TGS pero no la de TGN, así
    # que la tabla mostraba "-". Se calcula sobre el linepack TGN ya consolidado
    # contra el día con dato anterior (rellena sólo si no vino de otra fuente).
    prev_tgn = None
    for row in rows:
        lp = row.get('linepack_tgn')
        if lp is not None:
            if prev_tgn is not None and row.get('var_linepack_tgn') is None:
                row['var_linepack_tgn'] = round(lp - prev_tgn, 2)
            prev_tgn = lp

    # Forward-fill the operating bands. The Min/Max limits only arrive on PS
    # report days; on weekends/holidays and on "today" (before that day's PS
    # publishes) they'd be null, which drops the TGN/TGS % KPI and the chart band
    # on the most recent row. Limits are slow-moving setpoints, so carrying the
    # last known value forward is the right behaviour.
    LIMIT_FIELDS = [
        'lim_inf_tgs', 'lim_sup_tgs', 'lim_inf_tgn', 'lim_sup_tgn',
        'lim_inf_total', 'lim_sup_total',
    ]
    last = {}
    for row in rows:
        for k in LIMIT_FIELDS:
            if row.get(k) is not None:
                last[k] = row[k]
            elif k in last:
                row[k] = last[k]

    # source_date = último día con dato cerrado real (no las filas que sólo
    # llevan la proyección de combustibles, que se extienden al futuro).
    real_dates = [r['fecha'] for r in rows if r.get('fecha') and (
        r.get('demanda_total') is not None or r.get('linepack_total') is not None
        or r.get('linepack_tgn') is not None or r.get('linepack_tgs') is not None
        or r.get('cammesa_gas') is not None)]
    latest = max(real_dates) if real_dates else (rows[-1]['fecha'] if rows else None)
    write_json(
        DAILY_JSON, rows,
        source='Construido de RDS + PS + ING + ETGS + PPO (histórico manual congelado en daily_history.json)',
        source_date=latest,
    )
    write_csv(json_to_csv_path(DAILY_JSON),
              ({k: r.get(k) for k in fields} for r in rows),
              fieldnames=fields)
    print(f"daily.json: {len(rows)} rows, {rows[0]['fecha']} -> {latest} "
          f"(último cierre real)")
    return 0


if __name__ == '__main__':
    sys.exit(main())
