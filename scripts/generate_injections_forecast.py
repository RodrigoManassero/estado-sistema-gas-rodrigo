import json
import os
from datetime import datetime, timedelta

def load_json(filepath):
    if not os.path.exists(filepath):
        print(f"Error: No se encontró el archivo {filepath}")
        return None
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        # Soporte para formato envuelto {generated_at, data} o lista plana
        return data.get('data', data) if isinstance(data, dict) else data

def save_json(filepath, payload):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

def main():
    ps_path = 'public/data/enargas_ps.json'
    demand_path = 'public/data/demand_forecast.json'
    output_path = 'public/data/inyections_forecast.json'

    ps_rows = load_json(ps_path) or []
    demand_rows = load_json(demand_path) or []

    if not ps_rows or not demand_rows:
        print("No hay datos suficientes para generar el forecast.")
        return

    # ---------------------------------------------------------------------
    # Paso 1: Encontrar la última fecha con datos reales válidos en PS
    # ---------------------------------------------------------------------
    valid_ps_rows = []
    keys_check = ['iny_tgs', 'iny_tgn', 'iny_gpm', 'iny_bolivia', 'iny_chile', 'iny_escobar', 'iny_enarsa']

    for row in ps_rows:
        fecha = row.get('fecha') or row.get('Día Operativo')
        if not fecha:
            continue
        
        # Consideramos dato existente si alguna clave existe (incluso si vale 0)
        has_data = any(row.get(k) is not None for k in keys_check)
        if has_data:
            valid_ps_rows.append((str(fecha).strip(), row))

    if not valid_ps_rows:
        print("No se encontraron filas válidas en enargas_ps.json.")
        return

    # Ordenar por fecha y tomar la última fecha real
    valid_ps_rows.sort(key=lambda x: x[0])
    last_real_date_str = valid_ps_rows[-1][0]
    print(f"Última fecha con datos reales en PS: {last_real_date_str}")

    # ---------------------------------------------------------------------
    # Paso 2: Obtener los últimos 10 días reales para calcular el % de mix
    # ---------------------------------------------------------------------
    last_10 = valid_ps_rows[-10:]
    
    sum_tgs = 0.0
    sum_tgn = 0.0
    sum_gpm = 0.0
    sum_bolivia = 0.0
    sum_chile = 0.0
    sum_escobar = 0.0

    for _, r in last_10:
        sum_tgs += float(r.get('iny_tgs') or 0.0)
        sum_tgn += float(r.get('iny_tgn') or 0.0)
        # GPM / ENARSA
        sum_gpm += float(r.get('iny_gpm') or r.get('iny_enarsa') or 0.0)
        sum_bolivia += float(r.get('iny_bolivia') or 0.0)
        sum_chile += float(r.get('iny_chile') or 0.0)
        sum_escobar += float(r.get('iny_escobar') or 0.0)

    total_historical = sum_tgs + sum_tgn + sum_gpm + sum_bolivia + sum_chile + sum_escobar

    # Si por algún motivo el total da 0, asignamos proporciones fallback basadas en Neuquina/GBA
    if total_historical <= 0:
        w_tgs, w_tgn, w_gpm, w_bolivia, w_chile, w_escobar = 0.55, 0.25, 0.20, 0.0, 0.0, 0.0
    else:
        w_tgs = sum_tgs / total_historical
        w_tgn = sum_tgn / total_historical
        w_gpm = sum_gpm / total_historical
        w_bolivia = sum_bolivia / total_historical
        w_chile = sum_chile / total_historical
        w_escobar = sum_escobar / total_historical

    print(f"Mix de inyección (10d): TGS={w_tgs:.1%}, TGN={w_tgn:.1%}, GPM={w_gpm:.1%}, Escobar={w_escobar:.1%}")

    # ---------------------------------------------------------------------
    # Paso 3: Filtrar fechas proyectadas en demand_forecast (> last_real_date)
    # ---------------------------------------------------------------------
    forecast_results = []

    for d_row in demand_rows:
        d_fecha = str(d_row.get('fecha', '')).strip()
        if not d_fecha:
            continue

        # Solo procesamos si es posterior a la última fecha real
        if d_fecha > last_real_date_str:
            target_demand = float(d_row.get('demanda_total') or d_row.get('demand_mmm3d') or d_row.get('demanda') or 0.0)

            # Calculamos la inyección para cubertura 100% (Desbalance 0)
            iny_tgs = round(target_demand * w_tgs, 2)
            iny_tgn = round(target_demand * w_tgn, 2)
            iny_gpm = round(target_demand * w_gpm, 2)
            iny_bolivia = round(target_demand * w_bolivia, 2)
            iny_chile = round(target_demand * w_chile, 2)
            iny_escobar = round(target_demand * w_escobar, 2)

            iny_total = round(iny_tgs + iny_tgn + iny_gpm + iny_bolivia + iny_chile + iny_escobar, 2)

            forecast_results.append({
                "fecha": d_fecha,
                "demanda_estimada": target_demand,
                "iny_tgs": iny_tgs,
                "iny_tgn": iny_tgn,
                "iny_gpm": iny_gpm,
                "iny_bolivia": iny_bolivia,
                "iny_chile": iny_chile,
                "iny_escobar": iny_escobar,
                "iny_total": iny_total
            })

    # Output final con sobre envelope
    output_envelope = {
        "generated_at": datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        "source": "Enargas PS + Demand Forecast Model",
        "last_real_date": last_real_date_str,
        "historical_weights": {
            "tgs": round(w_tgs, 4),
            "tgn": round(w_tgn, 4),
            "gpm": round(w_gpm, 4),
            "bolivia": round(w_bolivia, 4),
            "chile": round(w_chile, 4),
            "escobar": round(w_escobar, 4)
        },
        "data": forecast_results
    }

    save_json(output_path, output_envelope)
    print(f"¡Éxito! Generadas {len(forecast_results)} filas proyectadas en {output_path}")

if __name__ == '__main__':
    main()
