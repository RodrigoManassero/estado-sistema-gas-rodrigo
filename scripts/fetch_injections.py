#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone

def load_json(filepath):
    if not os.path.exists(filepath):
        print(f"Error: No se encontró el archivo {filepath}")
        return {}
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(filepath, payload):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

def build_injections_daily():
    ps_path = 'public/data/enargas_ps.json'
    forecast_path = 'public/data/inyections_forecast.json'
    output_path = 'public/data/injections_daily.json'

    data_ps = load_json(ps_path)
    data_forecast = load_json(forecast_path)

    if not data_ps or not data_forecast:
        print("Error: No se pudieron cargar los datos de entrada.")
        return

    daily_map = {}

    # 1. Procesar datos históricos de ENARGAS PS
    ps_rows = data_ps.get('data', []) if isinstance(data_ps, dict) else data_ps
    for item in ps_rows:
        if not isinstance(item, dict):
            continue
        fecha = item.get('fecha')
        if not fecha:
            continue

        tipo = item.get('tipo')
        is_real = tipo == 'R'
        is_programmed = tipo == 'P'

        origen = 'ENARGAS_PS_REAL' if is_real else ('ENARGAS_PS_PROGRAMADO' if is_programmed else 'ENARGAS_PS')

        daily_map[fecha] = {
            "fecha": fecha,
            "origen": origen,
            "tipo": tipo,
            "temp_prom_ba": item.get('temp_prom_ba'),
            "demanda_total": item.get('demanda_total'),
            "iny_total": item.get('iny_total'),
            "iny_tgs": item.get('iny_tgs'),
            "iny_tgn": item.get('iny_tgn'),
            "iny_gpm": item.get('iny_gpm'),
            "iny_bolivia": item.get('iny_bolivia'),
            "iny_chile": item.get('iny_chile'),
            "iny_escobar": item.get('iny_escobar'),
            "linepack_total": item.get('linepack_total'),
            "source_file": item.get('source')
        }

    # 2. Complementar/sobreescribir con el Forecast
    forecast_rows = data_forecast.get('data', []) if isinstance(data_forecast, dict) else data_forecast
    for item in forecast_rows:
        if not isinstance(item, dict):
            continue
        fecha = item.get('fecha')
        if not fecha:
            continue

        existing = daily_map.get(fecha)

        # Si no existe o si el dato existente no es de tipo REAL ('R'), tomamos el forecast
        if not existing or existing.get('tipo') != 'R':
            daily_map[fecha] = {
                "fecha": fecha,
                "origen": "MODELO_FORECAST",
                "tipo": "F",
                "temp_prom_ba": existing.get('temp_prom_ba') if existing else None,
                "demanda_total": item.get('demanda_total') or item.get('demanda_estimada'),
                "iny_total": item.get('iny_total'),
                "iny_tgs": item.get('iny_tgs'),
                "iny_tgn": item.get('iny_tgn'),
                "iny_gpm": item.get('iny_gpm'),
                "iny_bolivia": item.get('iny_bolivia', 0.0),
                "iny_chile": item.get('iny_chile', 0.0),
                "iny_escobar": item.get('iny_escobar', 0.0),
                "linepack_total": existing.get('linepack_total') if existing else None,
                "source_file": data_forecast.get('source', 'Forecast Model')
            }

    # 3. Ordenar cronológicamente
    daily_series = [daily_map[k] for k in sorted(daily_map.keys())]

    output_payload = {
        "generated_at": datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        "description": "Serie diaria unificada de inyecciones y demanda (Histórico ENARGAS + Proyección Modelada)",
        "last_ps_date": data_forecast.get('last_ps_date') or data_ps.get('source_date'),
        "total_records": len(daily_series),
        "data": daily_series
    }

    save_json(output_path, output_payload)
    print(f"¡Éxito! Unificados {len(daily_series)} registros en {output_path}")

if __name__ == '__main__':
    build_injections_daily()
