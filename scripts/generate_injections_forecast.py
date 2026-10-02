import json
import os
from datetime import datetime, timezone

def load_json(filepath):
    if not os.path.exists(filepath):
        print(f"Error: No se encontró el archivo {filepath}")
        return []
    with open(filepath, 'r', encoding='utf-8') as f:
        content = json.load(f)
        if isinstance(content, dict):
            # 1. Caso demand_forecast.json: {"data": {"forecast": [...]}}
            if isinstance(content.get('data'), dict) and 'forecast' in content['data']:
                return content['data']['forecast']
            # 2. Caso estándar: {"data": [...]}
            if 'data' in content and isinstance(content['data'], list):
                return content['data']
            # 3. Caso rows: {"rows": [...]}
            if 'rows' in content and isinstance(content['rows'], list):
                return content['rows']
            return [content]
        elif isinstance(content, list):
            return content
        return []

def save_json(filepath, payload):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

def parse_to_standard_date(val):
    """ Convierte cualquier fecha (DD/MM/YYYY o ISO YYYY-MM-DD) a YYYY-MM-DD """
    if not val:
        return ''
    s = str(val).strip().split('T')[0]
    
    # Manejar formato DD/MM/YYYY
    if '/' in s:
        parts = s.split('/')
        if len(parts) == 3:
            day, month, year = parts
            return f"{year.zfill(4)}-{month.zfill(2)}-{day.zfill(2)}"
            
    # Manejar formato YYYY-MM-DD
    if '-' in s:
        parts = s.split('-')
        if len(parts) == 3:
            year, month, day = parts
            return f"{year.zfill(4)}-{month.zfill(2)}-{day.zfill(2)}"
            
    return s[:10]

def main():
    ps_path = 'public/data/enargas_ps.json'
    demand_path = 'public/data/demand_forecast.json'
    output_path = 'public/data/inyections_forecast.json'

    ps_rows = load_json(ps_path)
    demand_rows = load_json(demand_path)

    print(f"Filas cargadas -> PS: {len(ps_rows)}, Demand: {len(demand_rows)}")

    if not ps_rows or not demand_rows:
        print("Error: No hay datos suficientes para generar el forecast.")
        return

    # ---------------------------------------------------------------------
    # Paso 1: Mapear y procesar datos válidos de enargas_ps.json
    # ---------------------------------------------------------------------
    valid_ps_rows = []
    keys_check = ['iny_tgs', 'iny_tgn', 'iny_gpm', 'iny_bolivia', 'iny_chile', 'iny_escobar', 'iny_enarsa']

    # Diccionario para agrupar históricamente por fecha
    unified_map = {}

    for row in ps_rows:
        if not isinstance(row, dict):
            continue

        raw_date = row.get('fecha') or row.get('source_date') or row.get('Día Operativo') or row.get('date')
        fecha = parse_to_standard_date(raw_date)
        if not fecha:
            continue
        
        has_data = any(row.get(k) is not None for k in keys_check)
        if has_data:
            valid_ps_rows.append((fecha, row))

            # Tipo de registro (R: Real, P: Programado)
            tipo = row.get('tipo', None)
            is_real = tipo == 'R'

            unified_map[fecha] = {
                "fecha": fecha,
                "origen": "ENARGAS_PS_REAL" if is_real else "ENARGAS_PS_PROGRAMADO",
                "tipo": tipo,
                "temp_prom_ba": row.get('temp_prom_ba', None),
                "demanda_total": row.get('demanda_total', None),
                "iny_tgs": row.get('iny_tgs', None),
                "iny_tgn": row.get('iny_tgn', None),
                "iny_gpm": row.get('iny_gpm') or row.get('iny_enarsa'),
                "iny_bolivia": row.get('iny_bolivia', 0.0),
                "iny_chile": row.get('iny_chile', 0.0),
                "iny_escobar": row.get('iny_escobar', 0.0),
                "iny_total": row.get('iny_total', None),
                "linepack_total": row.get('linepack_total', None)
            }

    if not valid_ps_rows:
        print("Error: No se encontraron filas válidas en enargas_ps.json.")
        return

    valid_ps_rows.sort(key=lambda x: x[0])
    last_ps_date_str = valid_ps_rows[-1][0]
    print(f"Última fecha detectada en enargas_ps.json: '{last_ps_date_str}'")

    # ---------------------------------------------------------------------
    # Paso 2: Obtener los últimos 10 días de PS para calcular el % de mix
    # ---------------------------------------------------------------------
    last_10 = valid_ps_rows[-10:]
    
    sum_tgs = sum(float(r.get('iny_tgs') or 0.0) for _, r in last_10)
    sum_tgn = sum(float(r.get('iny_tgn') or 0.0) for _, r in last_10)
    sum_gpm = sum(float(r.get('iny_gpm') or r.get('iny_enarsa') or 0.0) for _, r in last_10)
    sum_bolivia = sum(float(r.get('iny_bolivia') or 0.0) for _, r in last_10)
    sum_chile = sum(float(r.get('iny_chile') or 0.0) for _, r in last_10)
    sum_escobar = sum(float(r.get('iny_escobar') or 0.0) for _, r in last_10)

    total_historical = sum_tgs + sum_tgn + sum_gpm + sum_bolivia + sum_chile + sum_escobar

    if total_historical <= 0:
        w_tgs, w_tgn, w_gpm, w_bolivia, w_chile, w_escobar = 0.55, 0.25, 0.20, 0.0, 0.0, 0.0
    else:
        w_tgs = sum_tgs / total_historical
        w_tgn = sum_tgn / total_historical
        w_gpm = sum_gpm / total_historical
        w_bolivia = sum_bolivia / total_historical
        w_chile = sum_chile / total_historical
        w_escobar = sum_escobar / total_historical

    print(f"Mix histórico (10d): TGS={w_tgs:.1%}, TGN={w_tgn:.1%}, GPM={w_gpm:.1%}, Escobar={w_escobar:.1%}")

    # ---------------------------------------------------------------------
    # Paso 3: Iterar demand_forecast y agregar proyecciones futuras
    # ---------------------------------------------------------------------
    for d_row in demand_rows:
        if not isinstance(d_row, dict):
            continue

        raw_d_fecha = d_row.get('fecha') or d_row.get('date') or d_row.get('Date')
        d_fecha = parse_to_standard_date(raw_d_fecha)
        if not d_fecha:
            continue

        # Fechas estrictamente posteriores a la última cargada en enargas_ps.json
        if d_fecha > last_ps_date_str:
            target_demand = float(
                d_row.get('demanda_total_est') or 
                d_row.get('demanda_total') or 
                d_row.get('demand_mmm3d') or 
                d_row.get('demanda') or 
                d_row.get('total') or 0.0
            )

            if target_demand == 0.0:
                prio = float(d_row.get('prioritaria_est') or d_row.get('prioritaria') or 0.0)
                usi = float(d_row.get('usinas_est') or d_row.get('usinas') or 0.0)
                ind = float(d_row.get('industria_est') or d_row.get('industria') or 0.0)
                gnc = float(d_row.get('gnc_est') or d_row.get('gnc') or 0.0)
                target_demand = prio + usi + ind + gnc

            iny_tgs = round(target_demand * w_tgs, 2)
            iny_tgn = round(target_demand * w_tgn, 2)
            iny_gpm = round(target_demand * w_gpm, 2)
            iny_bolivia = round(target_demand * w_bolivia, 2)
            iny_chile = round(target_demand * w_chile, 2)
            iny_escobar = round(target_demand * w_escobar, 2)

            iny_total = round(iny_tgs + iny_tgn + iny_gpm + iny_bolivia + iny_chile + iny_escobar, 2)

            unified_map[d_fecha] = {
                "fecha": d_fecha,
                "origen": "MODELO_FORECAST",
                "tipo": "F",
                "temp_prom_ba": None,
                "demanda_total": target_demand,
                "iny_tgs": iny_tgs,
                "iny_tgn": iny_tgn,
                "iny_gpm": iny_gpm,
                "iny_bolivia": iny_bolivia,
                "iny_chile": iny_chile,
                "iny_escobar": iny_escobar,
                "iny_total": iny_total,
                "linepack_total": None
            }

    # Ordenar la lista resultante por fecha
    sorted_data = [unified_map[k] for k in sorted(unified_map.keys())]

    output_envelope = {
        "generated_at": datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        "source": "Enargas PS + Demand Forecast Model",
        "last_ps_date": last_ps_date_str,
        "historical_weights": {
            "tgs": round(w_tgs, 4),
            "tgn": round(w_tgn, 4),
            "gpm": round(w_gpm, 4),
            "bolivia": round(w_bolivia, 4),
            "chile": round(w_chile, 4),
            "escobar": round(w_escobar, 4)
        },
        "total_records": len(sorted_data),
        "data": sorted_data
    }

    save_json(output_path, output_envelope)
    print(f"¡Éxito! Generadas {len(sorted_data)} filas unificadas (histórico + proyección) en {output_path}")

if __name__ == '__main__':
    main()
