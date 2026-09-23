#!/usr/bin/env python3
"""Fetch 2 years of historical daily temperatures from Open-Meteo.

Combines Open-Meteo Archive API (for long historical data) and Forecast API
(with past_days to bridge the ~7-day lag up to yesterday).
Output is used by generate_forecast.py and frontend charts.
"""

import os
import sys
from datetime import date, timedelta

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402
from fetch_weather import CITIES  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
YEARS_BACK = 2


def fetch_city_history(city_id, label, lat, lon, region, start, end, timeout=30):
    # 1. Traer historia pesada de Archive API (hasta 'end', aprox. hace 7 días)
    params_archive = {
        'latitude': lat,
        'longitude': lon,
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'daily': 'temperature_2m_max,temperature_2m_min',
        'timezone': 'America/Argentina/Buenos_Aires',
    }
    r = requests.get(ARCHIVE_URL, params=params_archive, timeout=timeout)
    r.raise_for_status()
    payload_archive = r.json().get('daily', {})

    history_map = {}
    
    dates_arch = payload_archive.get('time', []) or []
    maxs_arch = payload_archive.get('temperature_2m_max', []) or []
    mins_arch = payload_archive.get('temperature_2m_min', []) or []

    for i, fecha in enumerate(dates_arch):
        t_max = maxs_arch[i] if i < len(maxs_arch) else None
        t_min = mins_arch[i] if i < len(mins_arch) else None
        t_prom = round((t_max + t_min) / 2, 1) if t_max is not None and t_min is not None else None
        history_map[fecha] = {'fecha': fecha, 'temp_max': t_max, 'temp_min': t_min, 'temp_prom': t_prom}

    # 2. Traer días recientes (incluyendo ayer) desde Forecast API con past_days
    params_recent = {
        'latitude': lat,
        'longitude': lon,
        'past_days': 10,
        'forecast_days': 1,
        'daily': 'temperature_2m_max,temperature_2m_min',
        'timezone': 'America/Argentina/Buenos_Aires',
    }
    try:
        r_rec = requests.get(FORECAST_URL, params=params_recent, timeout=timeout)
        r_rec.raise_for_status()
        payload_rec = r_rec.json().get('daily', {})
        
        dates_rec = payload_rec.get('time', []) or []
        maxs_rec = payload_rec.get('temperature_2m_max', []) or []
        mins_rec = payload_rec.get('temperature_2m_min', []) or []

        today_str = date.today().isoformat()

        for i, fecha in enumerate(dates_rec):
            # Solo guardamos días estrictamente pasados (hasta ayer)
            if fecha >= today_str:
                continue
            t_max = maxs_rec[i] if i < len(maxs_rec) else None
            t_min = mins_rec[i] if i < len(mins_rec) else None
            t_prom = round((t_max + t_min) / 2, 1) if t_max is not None and t_min is not None else None
            
            # Sobrescribimos o agregamos para cubrir el lag de la Archive API
            history_map[fecha] = {'fecha': fecha, 'temp_max': t_max, 'temp_min': t_min, 'temp_prom': t_prom}
    except Exception as e:
        print(f"  Warning: couldn't fetch recent days for {city_id}: {e}", file=sys.stderr)

    # Ordenar cronológicamente
    sorted_rows = [history_map[k] for k in sorted(history_map.keys())]

    return {
        'id': city_id,
        'label': label,
        'lat': lat,
        'lon': lon,
        'region': region,
        'history': sorted_rows,
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    
    today = date.today()
    # Archive llega seguro hasta hace 7 días
    end = today - timedelta(days=7)
    start = end.replace(year=end.year - YEARS_BACK)

    print(f"Fetching Open-Meteo history ({start} to yesterday) for {len(CITIES)} cities")

    cities_out = []
    failures = []
    for city_id, label, lat, lon, region in CITIES:
        try:
            data = fetch_city_history(city_id, label, lat, lon, region, start, end)
            cities_out.append(data)
            print(f"  {city_id}: {len(data['history'])} days")
        except Exception as e:
            failures.append(f"{city_id}: {e}")
            print(f"  {city_id}: FAILED ({e})", file=sys.stderr)

    history_path = os.path.join(OUT_DIR, 'weather_history.json')
    write_json(
        history_path,
        cities_out,
        source=f'Open-Meteo API ({start} to {today - timedelta(days=1)})',
        source_date=(today - timedelta(days=1)).isoformat(),
        failures=failures,
    )

    history_flat = [
        {
            'ciudad_id': c['id'],
            'ciudad': c['label'],
            'region': c['region'],
            'lat': c['lat'],
            'lon': c['lon'],
            'fecha': h['fecha'],
            'temp_max': h['temp_max'],
            'temp_min': h['temp_min'],
            'temp_prom': h['temp_prom'],
        }
        for c in cities_out for h in c.get('history', [])
    ]
    write_csv(json_to_csv_path(history_path), history_flat)
    print(f"weather_history.json: {len(cities_out)} cities, "
          f"{sum(len(c['history']) for c in cities_out)} total rows")


if __name__ == '__main__':
    main()
