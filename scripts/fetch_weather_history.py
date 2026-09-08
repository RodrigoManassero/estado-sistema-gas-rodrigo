#!/usr/bin/env python3
"""Fetch 2 years of historical daily temperatures from Open-Meteo Archive API.

Free, public, no auth. Runs once (or anytime you want to refresh); output
is used by generate_forecast.py to train a regression with more data points
than the ~20 rows we have from the Excel base.
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
YEARS_BACK = 2


def fetch_city_history(city_id, label, lat, lon, region, start, end, timeout=30):
    params = {
        'latitude': lat,
        'longitude': lon,
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'daily': 'temperature_2m_max,temperature_2m_min',
        'timezone': 'America/Argentina/Buenos_Aires',
    }
    r = requests.get(ARCHIVE_URL, params=params, timeout=timeout)
    r.raise_for_status()
    payload = r.json()
    daily = payload.get('daily', {})
    dates = daily.get('time', []) or []
    maxs = daily.get('temperature_2m_max', []) or []
    mins = daily.get('temperature_2m_min', []) or []

    rows = []
    for i, fecha in enumerate(dates):
        t_max = maxs[i] if i < len(maxs) else None
        t_min = mins[i] if i < len(mins) else None
        t_prom = round((t_max + t_min) / 2, 1) if t_max is not None and t_min is not None else None
        rows.append({'fecha': fecha, 'temp_max': t_max, 'temp_min': t_min, 'temp_prom': t_prom})

    return {
        'id': city_id,
        'label': label,
        'lat': lat,
        'lon': lon,
        'region': region,
        'history': rows,
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    # Archive trails real-time by ~5 days; pick yesterday - 5d as a safe end.
    today = date.today()
    end = today - timedelta(days=7)
    start = end.replace(year=end.year - YEARS_BACK)

    print(f"Fetching Open-Meteo archive {start} to {end} for {len(CITIES)} cities")

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
        source=f'Open-Meteo Archive API ({start} to {end})',
        source_date=end.isoformat(),
        failures=failures,
    )
    # Long format: one row per (ciudad, fecha). ~7300 rows per city → ~73k total.
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
