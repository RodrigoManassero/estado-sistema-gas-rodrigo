#!/usr/bin/env python3
"""Fetch 14-day weather forecast for multiple Argentine cities from Open-Meteo.

Open-Meteo is free and requires no API key. Writes:
- weather.json         : Buenos Aires only (kept for backwards compat)
- weather_regions.json : all cities with lat/lon for the map view
"""

import os
import sys
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')

API_BASE = (
    'https://api.open-meteo.com/v1/forecast'
    '?latitude={lat}&longitude={lon}'
    '&daily=temperature_2m_max,temperature_2m_min'
    '&timezone=America/Argentina/Buenos_Aires'
    '&forecast_days=14'
)

# Cities selected for demand / supply relevance:
# - BA, Rosario, Córdoba, Santa Fe, Tucumán  -> prioritaria/industria
# - Neuquén, Bahía Blanca                    -> supply (Vaca Muerta, GNL)
# - Mendoza, Esquel                          -> secondary demand centers
# - Salta                                    -> NOA + Bolivia gas entry
CITIES = [
    # id, label, lat, lon, region
    ('ba', 'Buenos Aires', -34.6037, -58.3816, 'pampa'),
    ('rosario', 'Rosario', -32.9468, -60.6393, 'pampa'),
    ('cordoba', 'Córdoba', -31.4201, -64.1888, 'centro'),
    ('santafe', 'Santa Fe', -31.6333, -60.7000, 'pampa'),
    ('mendoza', 'Mendoza', -32.8895, -68.8458, 'cuyo'),
    ('neuquen', 'Neuquén', -38.9517, -68.0591, 'patagonia'),
    ('bahiablanca', 'Bahía Blanca', -38.7196, -62.2724, 'pampa'),
    ('esquel', 'Esquel', -42.9077, -71.3229, 'patagonia'),
    ('salta', 'Salta', -24.7859, -65.4117, 'noa'),
    ('tucuman', 'Tucumán', -26.8083, -65.2176, 'noa'),
]


def fetch_city(city_id, label, lat, lon, region, timeout=15):
    url = API_BASE.format(lat=lat, lon=lon)
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    raw = response.json()
    daily = raw.get('daily', {})
    dates = daily.get('time', []) or []
    maxs = daily.get('temperature_2m_max', []) or []
    mins = daily.get('temperature_2m_min', []) or []

    forecast = []
    for i, fecha in enumerate(dates):
        t_max = maxs[i] if i < len(maxs) else None
        t_min = mins[i] if i < len(mins) else None
        t_prom = round((t_max + t_min) / 2, 1) if t_max is not None and t_min is not None else None
        forecast.append({
            'fecha': fecha,
            'temp_max': t_max,
            'temp_min': t_min,
            'temp_prom': t_prom,
        })

    return {
        'id': city_id,
        'label': label,
        'lat': lat,
        'lon': lon,
        'region': region,
        'forecast': forecast,
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    cities_out = []
    failures = []
    for city_id, label, lat, lon, region in CITIES:
        try:
            cities_out.append(fetch_city(city_id, label, lat, lon, region))
            print(f"  {city_id}: {len(cities_out[-1]['forecast'])} days")
        except Exception as e:
            failures.append(f"{city_id}: {e}")
            print(f"  {city_id}: FAILED ({e})", file=sys.stderr)

    if not cities_out:
        print("No city succeeded; aborting weather fetch", file=sys.stderr)
        sys.exit(1)

    first_date = cities_out[0]['forecast'][0]['fecha'] if cities_out[0]['forecast'] else None

    # Backwards-compat: weather.json keeps just BA so existing charts/forecast
    # pipeline don't change. Everything else reads weather_regions.json.
    ba = next((c for c in cities_out if c['id'] == 'ba'), cities_out[0])
    weather_path = os.path.join(OUT_DIR, 'weather.json')
    write_json(
        weather_path,
        {'forecast': ba['forecast']},
        source='Open-Meteo API (Buenos Aires)',
        source_date=first_date,
    )
    write_csv(
        json_to_csv_path(weather_path),
        ba['forecast'],
        fieldnames=['fecha', 'temp_max', 'temp_min', 'temp_prom'],
    )
    print(f"weather.json: {len(ba['forecast'])} days (BA)")

    regions_path = os.path.join(OUT_DIR, 'weather_regions.json')
    write_json(
        regions_path,
        cities_out,
        source='Open-Meteo API (multi-ciudad)',
        source_date=first_date,
        failures=failures,
    )
    # Long format: one row per (ciudad, fecha).
    regions_flat = [
        {
            'ciudad_id': c['id'],
            'ciudad': c['label'],
            'region': c['region'],
            'lat': c['lat'],
            'lon': c['lon'],
            'fecha': f['fecha'],
            'temp_max': f['temp_max'],
            'temp_min': f['temp_min'],
            'temp_prom': f['temp_prom'],
        }
        for c in cities_out for f in c.get('forecast', [])
    ]
    write_csv(json_to_csv_path(regions_path), regions_flat)
    print(f"weather_regions.json: {len(cities_out)} cities")


if __name__ == '__main__':
    main()
