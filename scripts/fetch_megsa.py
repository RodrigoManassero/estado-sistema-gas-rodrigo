#!/usr/bin/env python3
"""Fetch MEGSA public APIs: benchmarks + USD + trading rounds schedule.

MEGSA is the Argentine electronic gas market. Domestic spot prices live
behind agent login at negociacion.megsa.ar, but the public site exposes
a REST API at megsa.ar/api/ with context numbers that analysts care
about: international gas benchmarks (Henry Hub, TTF), crude (Brent/WTI),
the USD/ARS rate, and the schedule of upcoming trading rounds.
"""

import os
import sys
from datetime import datetime, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
BASE = 'https://www.megsa.ar/api/'
HDRS = {'User-Agent': 'Mozilla/5.0 Chrome/130 estado-red-gas'}


def fetch_json(path, timeout=30):
    r = requests.get(BASE + path, headers=HDRS, timeout=timeout)
    r.raise_for_status()
    return r.json()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    errors = []

    benchmarks = []
    try:
        benchmarks = fetch_json('hidrocarburos')
    except Exception as e:
        errors.append(f'hidrocarburos: {e}')

    dolar = None
    try:
        raw = fetch_json('dolar')
        if isinstance(raw, dict) and raw.get('data'):
            dolar = raw['data'][0] if isinstance(raw['data'], list) else raw['data']
    except Exception as e:
        errors.append(f'dolar: {e}')

    rondas = []
    try:
        rondas_raw = fetch_json('rondas/publicadas') or []
        # Keep only the fields a dashboard needs and the most-future ones.
        for r in rondas_raw:
            rondas.append({
                'id': r.get('id'),
                'descripcion': (r.get('descripcion') or '').strip(),
                'publicaDesde': r.get('publicaDesde'),
                'fechaUltimaModificacion': r.get('fechaUltimaModificacion'),
            })
        rondas.sort(key=lambda x: x.get('publicaDesde') or '', reverse=True)
    except Exception as e:
        errors.append(f'rondas: {e}')

    payload = {
        'benchmarks': benchmarks,
        'dolar': dolar,
        'rondas': rondas,
        'fetched_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
    }

    megsa_path = os.path.join(OUT_DIR, 'megsa.json')
    write_json(
        megsa_path,
        payload,
        source='MEGSA public API (megsa.ar/api)',
        errors=errors or None,
    )
    # Three sub-CSVs, one per logical table. Named with the dataset as prefix.
    # megsa_benchmarks.csv — Henry Hub, TTF, Brent, WTI (MEGSA hidrocarburos endpoint).
    # megsa_fx.csv — one-row USD/ARS rate snapshot.
    # megsa_rondas.csv — upcoming/published trading rounds.
    base = os.path.splitext(megsa_path)[0]
    write_csv(f'{base}_benchmarks.csv', benchmarks or [])
    write_csv(f'{base}_fx.csv', [dolar] if dolar else [])
    write_csv(f'{base}_rondas.csv', rondas or [],
              fieldnames=['id', 'descripcion', 'publicaDesde', 'fechaUltimaModificacion'])
    ng = next((b for b in benchmarks if b.get('product') == 'NAT_GAS'), None)
    print(f"megsa.json written")
    print(f"  NAT GAS: {ng['currentPrice']} USD/MMbtu" if ng else "  NAT GAS: no price")
    print(f"  USD: {dolar.get('currentPrice') if dolar else '?'} ARS")
    print(f"  Rondas publicadas: {len(rondas)}")
    if errors:
        print(f"  WARN: {len(errors)} errors: {errors}", file=sys.stderr)


if __name__ == '__main__':
    main()
