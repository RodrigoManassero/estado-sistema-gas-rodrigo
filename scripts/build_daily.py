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
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
DAILY_JSON = os.path.join(OUT_DIR, 'daily.json')
HISTORY_JSON = os.path.join(OUT_DIR, 'daily_history.json')


def clean_fecha(f):
    """Normaliza cualquier string de fecha a formato estricto YYYY-MM-DD sin hora."""
    if not f:
        return None
    f_str = str(f).strip()
    if ' ' in f_str:
        f_str = f_str.split(' ')[0]
    if 'T' in f_str:
        f_str = f_str.split('T')[0]
    return f_str[:10] if len(f_str) >= 10 else f_str


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
GAS_KCAL_M3 = 9300
FUEL_KCAL = {
    'gasoil_m3': 9.08e6,    # ~0.845 t/m³ · 10750 kcal/kg
    'fueloil_tn': 9.6e6,    # 9600 kcal/kg · 1000 kg/t
    'carbon_tn': 6.0e6,     # 6000 kcal/kg · 1000 kg/t
}

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


def main():
    history, hist_env = _load('daily_history.json')
    if not history:
        print('ERROR: daily_history.json missing or empty — cannot build daily.json',
              file=sys.stderr)
        return 1
    fields = list(history[0].keys())
    for extra in (
        'estado_tgn',
        'cammesa_gas_est',
        'cammesa_gasoil_est',
        'cammesa_fueloil_est',
        'cammesa_carbon_est',
    ):
        if extra not in fields:
            fields.append(extra)

    def blank(fecha):
        row = {k: None for k in fields}
        row['fecha'] = fecha
        return row

    by_date = {}
    for d in history:
        f_clean = clean_fecha(d.get('fecha'))
        if f_clean:
            row_dict = dict(d)
            row_dict['fecha'] = f_clean
            by_date[f_clean] = row_dict

    hist_dates = {clean_fecha(d.get('fecha')) for d in history if d.get('fecha')}

    def row_for(fecha):
        f_clean = clean_fecha(fecha)
        if not f_clean:
            return None
        r = by_date.get(f_clean)
        if r is None:
            r = blank(f_clean)
            by_date[f_clean] = r
        return r

    rds, _ = _load('enargas.json')
    ing, _ = _load('enargas_ing.json')
    etgs, _ = _load('etgs.json')
    ppo, _ = _load('cammesa_ppo.json')
    weekly, _ = _load('cammesa_weekly.json')
    ps, _ = _load('enargas_ps.json')

    # PS
    for r in ps:
        row = row_for(r.get('fecha'))
        if not row:
            continue
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

    # RDS
    for r in rds:
        row = row_for(r.get('fecha'))
        if not row:
            continue
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

    # ING
    for r in ing:
        if r.get('tipo') != 'R':
            continue
        row = row_for(r.get('fecha'))
        if not row:
            continue
        row['iny_tgs'] = fillz(row['iny_tgs'], r.get('tgs'))
        row['iny_tgn'] = fillz(row['iny_tgn'], r.get('tgn'))
        row['iny_total'] = fillz(row['iny_total'], r.get('total'))

    # ETGS
    for r in etgs:
        f_clean = clean_fecha(r.get('fecha'))
        row = row_for(f_clean)
        if not row:
            continue
        lp = r.get('linepack_tgs_dia_actual')
        if lp is not None and f_clean not in hist_dates:
            row['linepack_tgs'] = lp
        else:
            row['linepack_tgs'] = fill(row['linepack_tgs'], lp)
        row['var_linepack_tgs'] = fill(row['var_linepack_tgs'], r.get('linepack_tgs_variacion'))

    # CAMMESA PPO (Dato cerrado real)
    for r in ppo:
        row = row_for(r.get('fecha'))
        if not row:
            continue
        row['cammesa_gas'] = fillz(row['cammesa_gas'], r.get('gas_mmm3'))
        row['cammesa_gasoil'] = fillz(
            row['cammesa_gasoil'], _gas_equiv_mmm3(r.get('gasoil_m3'), FUEL_KCAL['gasoil_m3']))
        row['cammesa_fueloil'] = fillz(
            row['cammesa_fueloil'], _gas_equiv_mmm3(r.get('fueloil_tn'), FUEL_KCAL['fueloil_tn']))
        row['cammesa_carbon'] = fillz(
            row['cammesa_carbon'], _gas_equiv_mmm3(r.get('carbon_tn'), FUEL_KCAL['carbon_tn']))
        row['cammesa_total'] = fillz(row['cammesa_total'], r.get('gas_mmm3'))

    # CAMMESA WEEKLY (Datos proyectados)
    for r in weekly:
        row = row_for(r.get('fecha'))
        if not row:
            continue

        row['cammesa_gas_est'] = fill(
            row.get('cammesa_gas_est'),
            round(float(r.get('gas_dam3', 0)) / 1000, 3)
        )
        row['cammesa_gasoil_est'] = fill(
            row.get('cammesa_gasoil_est'),
            _gas_equiv_mmm3(r.get('go'), FUEL_KCAL['gasoil_m3'])
        )
        row['cammesa_fueloil_est'] = fill(
            row.get('cammesa_fueloil_est'),
            _gas_equiv_mmm3(r.get('fo'), FUEL_KCAL['fueloil_tn'])
        )
        row['cammesa_carbon_est'] = fill(
            row.get('cammesa_carbon_est'),
            _gas_equiv_mmm3(r.get('cm'), FUEL_KCAL['carbon_tn'])
        )

    # TGN ABII
    tgn_state, _ = _load('tgn_system_state.json')
    for r in tgn_state:
        f_clean = clean_fecha(r.get('fecha'))
        row = row_for(f_clean)
        if not row:
            continue
        actual = r.get('Actual')
        try:
            mmm3 = round(float(actual) / 1_000_000, 2) if actual not in (None, '') else None
        except (TypeError, ValueError):
            mmm3 = None
        if mmm3 is not None:
            if f_clean not in hist_dates:
                row['linepack_tgn'] = mmm3
            else:
                row['linepack_tgn'] = fill(row['linepack_tgn'], mmm3)
        desb = _to_float(r.get('Desbalance porcentual'))
        if desb is not None:
            row['estado_tgn'] = 'ALERTA' if abs(desb) > TGN_TOLERANCIA_PCT else 'NORMAL'

    rows = sorted(
        by_date.values(),
        key=lambda r: r.get('fecha') or ''
    )

    # VAR TGN
    prev_tgn = None
    for row in rows:
        lp = row.get('linepack_tgn')
        if lp is not None:
            if prev_tgn is not None and row.get('var_linepack_tgn') is None:
                row['var_linepack_tgn'] = round(lp - prev_tgn, 2)
            prev_tgn = lp

    # Limits
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
    print(f"daily.json: {len(rows)} rows, {rows[0]['fecha']} -> {latest} (último cierre real)")
    return 0


if __name__ == '__main__':
    sys.exit(main())
