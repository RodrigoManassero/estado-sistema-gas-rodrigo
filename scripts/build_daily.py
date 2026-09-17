#!/usr/bin/env python3
"""Build daily.json applying 4-level priority cascade:
1. PS REAL (columna REAL de Proyección Semanal - cierre oficial de cuencas e importaciones)
2. RDS (Reporte Diario ENARGAS - consumo estimado y programa de importaciones del día)
3. PS Proyección (días hoy+1..+3 publicados por ENARGAS)
4. Modelo / Proyección Propia (balance de oferta derivado de demand_forecast.json)
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
DAILY_JSON = os.path.join(OUT_DIR, 'daily.json')
FORECAST_JSON = os.path.join(OUT_DIR, 'demand_forecast.json')


def clean_fecha(f):
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
    return cur if cur is not None else cand


def fillz(cur, cand):
    return cur if (cur is not None and cur != 0) else cand


def _get(d, *path):
    for k in path:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


GAS_KCAL_M3 = 9300
FUEL_KCAL = {
    'gasoil_m3': 9.08e6,
    'fueloil_tn': 9.6e6,
    'carbon_tn': 6.0e6,
}

TGN_TOLERANCIA_PCT = 7.0


def _gas_equiv_mmm3(qty, kcal_per_unit):
    if qty is None:
        return None
    return round(qty * kcal_per_unit / (GAS_KCAL_M3 * 1_000_000), 3)


def _to_float(s):
    if s is None:
        return None
    try:
        return float(str(s).replace(',', '.').strip())
    except (TypeError, ValueError):
        return None


def main():
    history, hist_env = _load('daily_history.json')
    if not history:
        print('ERROR: daily_history.json missing or empty', file=sys.stderr)
        return 1
        
    fields = list(history[0].keys())
    for extra in (
        'gnc',
        'combustible',
        'ajuste',
        'origen_dato',
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

    forecast_map = {}
    if os.path.exists(FORECAST_JSON):
        with open(FORECAST_JSON, encoding='utf-8') as f:
            raw_fc = json.load(f)
            fc_list = raw_fc.get('forecast', []) if isinstance(raw_fc, dict) else raw_fc
            for r in fc_list:
                f_raw = r.get('fecha') or r.get('Fecha')
                f_clean = clean_fecha(f_raw)
                dem = r.get('demanda_total') if r.get('demanda_total') is not None else r.get('demanda')
                if f_clean and dem is not None:
                    forecast_map[f_clean] = float(dem)

    rds, _ = _load('enargas.json')
    etgs, _ = _load('etgs.json')
    ppo, _ = _load('cammesa_ppo.json')
    weekly, _ = _load('cammesa_weekly.json')
    ps, _ = _load('enargas_ps.json')

    # 1. PRIORIDAD 3: PS PROYECCIÓN (Futuro publicado por ENARGAS)
    for r in ps:
        if r.get('tipo') == 'P':
            row = row_for(r.get('fecha'))
            if not row:
                continue
            row['demanda_total'] = fill(row['demanda_total'], r.get('demanda_total'))
            row['prioritaria'] = fill(row['prioritaria'], r.get('prioritaria'))
            row['usinas'] = fillz(row['usinas'], r.get('usinas'))
            row['industria'] = fillz(row['industria'], r.get('industria'))
            row['gnc'] = fillz(row['gnc'], r.get('gnc'))
            row['combustible'] = fillz(row['combustible'], r.get('combustible'))
            
            row['iny_tgs'] = fillz(row['iny_tgs'], r.get('iny_tgs'))
            row['iny_tgn'] = fillz(row['iny_tgn'], r.get('iny_tgn'))
            row['iny_total'] = fillz(row['iny_total'], r.get('iny_total'))
            row['iny_enarsa'] = fill(row['iny_enarsa'], r.get('iny_enarsa'))
            row['iny_gpm'] = fill(row['iny_gpm'], r.get('iny_gpm'))
            row['iny_bolivia'] = fill(row['iny_bolivia'], r.get('iny_bolivia'))
            row['iny_escobar'] = fill(row['iny_escobar'], r.get('iny_escobar'))
            row['origen_dato'] = 'PS_PROYECCION'

    # 2. PRIORIDAD 2: RDS (Reporte Diario - consumo y programa intradía de importaciones)
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
        row['usinas'] = fillz(row['usinas'], _get(r, 'consumos', 'usinas', 'programa'))
        row['industria'] = fillz(row['industria'], _get(r, 'consumos', 'industria', 'programa'))
        row['exportaciones'] = fillz(row['exportaciones'], exp_total)
        
        # Programa de Importaciones (pisa PS para el día operativo)
        imp_prog = r.get('programa_importacion') or {}
        if imp_prog:
            row['iny_bolivia'] = fill(imp_prog.get('bolivia'), row.get('iny_bolivia'))
            row['iny_escobar'] = fill(imp_prog.get('escobar'), row.get('iny_escobar'))
            row['iny_enarsa'] = fill(imp_prog.get('bahia_blanca'), row.get('iny_enarsa'))

        row['temp_prom_ba'] = fill(row['temp_prom_ba'], _get(r, 'temperatura_ba', 'tm'))
        row['temp_min_ba'] = fill(row['temp_min_ba'], _get(r, 'temperatura_ba', 'min'))
        row['temp_max_ba'] = fill(row['temp_max_ba'], _get(r, 'temperatura_ba', 'max'))
        row['linepack_total'] = fill(row['linepack_total'], r.get('linepack_total'))
        if row.get('origen_dato') != 'PS_PROYECCION':
            row['origen_dato'] = 'RDS_ESTIMADO'

    # 3. PRIORIDAD 1: PS REAL (Cierre oficial dentro de sistema)
    for r in ps:
        if r.get('tipo') == 'R' or r.get('demanda_total') is not None:
            row = row_for(r.get('fecha'))
            if not row:
                continue
            
            if r.get('demanda_total') is not None:
                row['demanda_total'] = r.get('demanda_total')
            if r.get('prioritaria') is not None:
                row['prioritaria'] = r.get('prioritaria')
            if r.get('usinas') is not None:
                row['usinas'] = r.get('usinas')
            if r.get('industria') is not None:
                row['industria'] = r.get('industria')
            if r.get('gnc') is not None:
                row['gnc'] = r.get('gnc')
            if r.get('combustible') is not None:
                row['combustible'] = r.get('combustible')
            if r.get('ajuste') is not None:
                row['ajuste'] = r.get('ajuste')
                
            exp = None
            if r.get('exp_tgn') is not None or r.get('exp_tgs') is not None:
                exp = (r.get('exp_tgn') or 0) + (r.get('exp_tgs') or 0)
            if exp is not None:
                row['exportaciones'] = exp
                
            row['iny_tgs'] = fillz(row['iny_tgs'], r.get('iny_tgs'))
            row['iny_tgn'] = fillz(row['iny_tgn'], r.get('iny_tgn'))
            row['iny_total'] = fillz(row['iny_total'], r.get('iny_total'))
            row['iny_enarsa'] = fill(row['iny_enarsa'], r.get('iny_enarsa'))
            row['iny_gpm'] = fill(row['iny_gpm'], r.get('iny_gpm'))
            row['iny_bolivia'] = fill(row['iny_bolivia'], r.get('iny_bolivia'))
            row['iny_escobar'] = fill(row['iny_escobar'], r.get('iny_escobar'))
            row['temp_prom_ba'] = fill(row['temp_prom_ba'], _get(r, 'temp_prom_ba'))
            row['linepack_total'] = fill(row['linepack_total'], r.get('linepack_total'))
            row['origen_dato'] = 'PS_REAL'

    # Complementos CAMMESA y TGN (Linepack y combustibles)
    for r in etgs:
        f_clean = clean_fecha(r.get('fecha'))
        row = row_for(f_clean)
        if row:
            lp = r.get('linepack_tgs_dia_actual')
            if lp is not None and f_clean not in hist_dates:
                row['linepack_tgs'] = lp
            else:
                row['linepack_tgs'] = fill(row['linepack_tgs'], lp)

    for r in ppo:
        row = row_for(r.get('fecha'))
        if row:
            row['cammesa_gas'] = fillz(row['cammesa_gas'], r.get('gas_mmm3'))
            row['cammesa_gasoil'] = fillz(row['cammesa_gasoil'], _gas_equiv_mmm3(r.get('gasoil_m3'), FUEL_KCAL['gasoil_m3']))
            row['cammesa_fueloil'] = fillz(row['cammesa_fueloil'], _gas_equiv_mmm3(r.get('fueloil_tn'), FUEL_KCAL['fueloil_tn']))
            row['cammesa_carbon'] = fillz(row['cammesa_carbon'], _gas_equiv_mmm3(r.get('carbon_tn'), FUEL_KCAL['carbon_tn']))

    tgn_state, _ = _load('tgn_system_state.json')
    for r in tgn_state:
        f_clean = clean_fecha(r.get('fecha'))
        row = row_for(f_clean)
        if row:
            actual = r.get('Actual')
            try:
                mmm3 = round(float(actual) / 1_000_000, 2) if actual not in (None, '') else None
            except (TypeError, ValueError):
                mmm3 = None
            if mmm3 is not None:
                row['linepack_tgn'] = mmm3 if f_clean not in hist_dates else fill(row['linepack_tgn'], mmm3)

    # Forzar filas para el horizonte del forecast
    for f_fc in forecast_map.keys():
        row_for(f_fc)

    rows = sorted(by_date.values(), key=lambda r: r.get('fecha') or '')

    # 4. PRIORIDAD 4: MODELO / PROYECCIÓN PROPIA (Solo aplica si NO fue poblado previamente por la PS)
    for row in rows:
        f = row['fecha']
        if row.get('demanda_total') is None and f in forecast_map:
            row['demanda_total'] = round(forecast_map[f], 1)
            row['origen_dato'] = 'MODELO_PROYECCION'

    # COMPLETADO Y DESAGROSE DE INYECCIONES EN CALIENTE
    recent_ps = [r for r in rows if r.get('iny_tgs') is not None and r.get('iny_tgn') is not None][-7:]
    
    if recent_ps:
        avg_tgs = sum(r['iny_tgs'] for r in recent_ps) / len(recent_ps)
        avg_tgn = sum(r['iny_tgn'] for r in recent_ps) / len(recent_ps)
        avg_bolivia = sum(r.get('iny_bolivia') or 0 for r in recent_ps) / len(recent_ps)
        avg_escobar = sum(r.get('iny_escobar') or 0 for r in recent_ps) / len(recent_ps)
        avg_enarsa = sum(r.get('iny_enarsa') or 0 for r in recent_ps) / len(recent_ps)
        
        tot_nac = avg_tgs + avg_tgn
        share_tgs = avg_tgs / tot_nac if tot_nac > 0 else 0.65
        share_tgn = avg_tgn / tot_nac if tot_nac > 0 else 0.35

        for row in rows:
            if row.get('demanda_total') is not None:
                row['iny_bolivia'] = fill(row.get('iny_bolivia'), round(avg_bolivia, 1))
                row['iny_escobar'] = fill(row.get('iny_escobar'), round(avg_escobar, 1))
                row['iny_enarsa'] = fill(row.get('iny_enarsa'), round(avg_enarsa, 1))
                
                if row.get('iny_tgs') is None or row.get('iny_tgn') is None:
                    dem = row['demanda_total']
                    imp = (row['iny_bolivia'] or 0) + (row['iny_escobar'] or 0) + (row['iny_enarsa'] or 0)
                    req_nac = max(dem - imp, 0)
                    
                    row['iny_tgs'] = round(req_nac * share_tgs, 1)
                    row['iny_tgn'] = round(req_nac * share_tgn, 1)
                    row['iny_total'] = round(dem, 1)
                    
                    if row.get('origen_dato') is None:
                        row['origen_dato'] = 'PROYECCION_INYECCION'

    # SANITIZACIÓN FINAL PARA RECHARTS (Reemplaza None por 0.0 en campos de inyección)
    INJECTION_FIELDS = ['iny_tgs', 'iny_tgn', 'iny_enarsa', 'iny_gpm', 'iny_bolivia', 'iny_escobar', 'iny_total']
    for row in rows:
        for fld in INJECTION_FIELDS:
            if row.get(fld) is None:
                row[fld] = 0.0

    real_dates = [r['fecha'] for r in rows if r.get('fecha') and (
        r.get('demanda_total') is not None or r.get('linepack_total') is not None)]
    latest = max(real_dates) if real_dates else (rows[-1]['fecha'] if rows else None)

    write_json(
        DAILY_JSON, rows,
        source='Cascada 4 niveles: PS_REAL > RDS > PS_PROJ > MODELO',
        source_date=latest,
    )
    write_csv(json_to_csv_path(DAILY_JSON),
              ({k: r.get(k) for k in fields} for r in rows),
              fieldnames=fields)
    
    print(f"daily.json actualizado correctamente: {len(rows)} filas hasta {latest}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
