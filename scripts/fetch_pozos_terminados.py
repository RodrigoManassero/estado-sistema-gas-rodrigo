#!/usr/bin/env python3
"""Fetch "Pozos terminados" — Secretaría de Energía monthly completed-well counts.

Source: datos.energia.gob.ar CKAN dataset
  "Perforación de pozos de petróleo y gas"
  package id 7ea2ac77-d7a0-4129-9fbf-6f1a25d94e21
  resource "Pozos terminados" (~190 MB, one row per
  (mes, empresa, areapermisoconcesion, concepto, ...))

This is the count of wells *terminados* (drilling completed) per month, which is
the public proxy for drilling activity. We stream the file, keep only Neuquén
basin rows, and aggregate to (mes, areapermisoconcesion) summing `cantidad` with
a per-concepto breakdown. The frontend (CuencaMap) divides a trailing-window
count by the concession area to render a "pozos perforados / km²" heatmap.

Unlike fetch_capiv (one CSV *per year*), this dataset publishes a single CSV
covering all history, so each successful parse rebuilds the whole JSON from the
complete source — no per-month upsert needed. We still keep a Last-Modified
cache so daily runs skip the 190 MB download when the resource is unchanged
(it refreshes roughly monthly).

Output:
  public/data/pozos_terminados.json  (envelope {generated_at, source, source_date, data: [rows]})
  public/data/pozos_terminados.csv

Aggregated row shape:
  {
    'mes':          'YYYY-MM',
    'area':         'LOMA CAMPANA',     # areapermisoconcesion (concesión / bloque)
    'cuenca':       'NEUQUINA',
    'provincia':    'Neuquén',          # dominant provincia in the group
    'pozos':        12,                 # total wells terminados in the month
    'pozos_pet':    8,                  # concepto "Productivos de Petróleo" (idconcepto 1)
    'pozos_gas':    3,                  # concepto "Productivos de Gas"       (idconcepto 2)
    'pozos_serv':   1,                  # concepto "Servicio"                 (idconcepto 4)
    'pozos_otros':  0,                  # everything else (improductivos, etc.)
  }

Usage:
  python scripts/fetch_pozos_terminados.py            # delta refresh (skip if unchanged)
  python scripts/fetch_pozos_terminados.py --force    # ignore cache, re-download
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
OUT_JSON = os.path.join(OUT_DIR, 'pozos_terminados.json')

DATASET_ID = '7ea2ac77-d7a0-4129-9fbf-6f1a25d94e21'
RESOURCE_ID = 'a2ce14af-5c56-45c2-9b9c-c7a1e5156dff'  # "Pozos terminados"
# Known direct download as a fallback if CKAN package_show is unavailable.
FALLBACK_URL = ('http://datos.energia.gob.ar/dataset/'
                f'{DATASET_ID}/resource/{RESOURCE_ID}/download/pozos-terminados.csv')
CKAN_BASE = 'http://datos.energia.gob.ar/api/3/action'
CACHE_PATH = os.path.join(os.path.dirname(__file__), '.pozos_terminados_cache.json')

HDRS = {'User-Agent': 'Mozilla/5.0 Chrome/130 estado-red-gas'}
TARGET_CUENCA = 'NEUQUINA'


def resolve_resource(session: requests.Session) -> dict:
    """Return the "Pozos terminados" resource dict (url + last_modified).

    Falls back to a hard-coded download URL if CKAN is unreachable.
    """
    try:
        r = session.get(f'{CKAN_BASE}/package_show',
                        params={'id': DATASET_ID}, headers=HDRS, timeout=60)
        r.raise_for_status()
        for res in r.json()['result'].get('resources', []):
            if res.get('id') == RESOURCE_ID:
                return res
    except Exception as e:
        print(f'  WARN: package_show failed ({e}); using fallback URL', file=sys.stderr)
    return {'id': RESOURCE_ID, 'url': FALLBACK_URL, 'last_modified': ''}


def load_cache() -> dict:
    if not os.path.exists(CACHE_PATH):
        return {}
    try:
        with open(CACHE_PATH, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_cache(cache: dict):
    with open(CACHE_PATH, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=2)


def _chain_first(first: str, rest):
    yield first
    yield from rest


def _safe_float(x) -> float:
    if x is None:
        return 0.0
    s = str(x).strip().replace(',', '.')
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def stream_resource(session: requests.Session, url: str) -> dict:
    """Stream the CSV, filter cuenca=NEUQUINA, aggregate to (mes, area)."""
    acc: dict = {}
    with session.get(url, headers=HDRS, stream=True, timeout=900) as r:
        r.raise_for_status()
        r.encoding = 'utf-8'
        lines = r.iter_lines(decode_unicode=True)
        first = next(lines, '')
        if first.startswith('﻿'):
            first = first[1:]
        reader = csv.DictReader(_chain_first(first, lines))
        seen = kept = 0
        for row in reader:
            seen += 1
            if (row.get('cuenca') or '').strip().upper() != TARGET_CUENCA:
                continue
            kept += 1
            _accumulate(acc, row)
        print(f'    rows seen={seen:,}  Neuquina kept={kept:,}')
    return acc


def _accumulate(acc: dict, row: dict):
    try:
        year = int(row['anio'])
        month = int(row['mes'])
    except (KeyError, ValueError, TypeError):
        return
    mes = f'{year:04d}-{month:02d}'
    area = (row.get('areapermisoconcesion') or '').strip() or 'SIN ÁREA'
    key = (mes, area)
    bucket = acc.get(key)
    if bucket is None:
        bucket = {
            'mes': mes,
            'area': area,
            'cuenca': row.get('cuenca'),
            'provincia_counts': defaultdict(float),
            'pozos': 0,
            'pozos_pet': 0,
            'pozos_gas': 0,
            'pozos_serv': 0,
            'pozos_otros': 0,
        }
        acc[key] = bucket
    cant = _safe_float(row.get('cantidad'))
    if cant <= 0:
        return
    n = int(round(cant))
    bucket['pozos'] += n
    # Classify by idconcepto (stable codes; avoids accent/encoding ambiguity):
    #   1 = Productivos de Petróleo, 2 = Productivos de Gas, 4 = Servicio.
    concepto = (row.get('idconcepto') or '').strip()
    if concepto == '1':
        bucket['pozos_pet'] += n
    elif concepto == '2':
        bucket['pozos_gas'] += n
    elif concepto == '4':
        bucket['pozos_serv'] += n
    else:
        bucket['pozos_otros'] += n
    prov = (row.get('provincia') or '').strip()
    if prov:
        bucket['provincia_counts'][prov] += cant


def finalize(acc: dict) -> list[dict]:
    rows = []
    for bucket in acc.values():
        provincia_counts = bucket.pop('provincia_counts')
        provincia = max(provincia_counts, key=provincia_counts.get) if provincia_counts else ''
        if bucket['pozos'] <= 0:
            continue  # months with no completed wells in this block add no signal
        rows.append({
            'mes': bucket['mes'],
            'area': bucket['area'],
            'cuenca': bucket['cuenca'],
            'provincia': provincia,
            'pozos': bucket['pozos'],
            'pozos_pet': bucket['pozos_pet'],
            'pozos_gas': bucket['pozos_gas'],
            'pozos_serv': bucket['pozos_serv'],
            'pozos_otros': bucket['pozos_otros'],
        })
    rows.sort(key=lambda r: (r['mes'], -r['pozos'], r['area']))
    return rows


def load_existing() -> list[dict]:
    if not os.path.exists(OUT_JSON):
        return []
    try:
        with open(OUT_JSON, encoding='utf-8') as f:
            raw = json.load(f)
        return raw.get('data', raw) if isinstance(raw, dict) else (raw or [])
    except Exception:
        return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true',
                        help='Ignore Last-Modified cache and re-download.')
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    session = requests.Session()

    print('Resolving "Pozos terminados" resource from CKAN...')
    res = resolve_resource(session)
    modified = res.get('last_modified') or ''
    url = res.get('url') or FALLBACK_URL

    cache = {} if args.force else load_cache()
    if not args.force and cache.get(RESOURCE_ID) == modified and os.path.exists(OUT_JSON):
        print(f'  unchanged since last run ({modified}), skipping download')
        return 0

    print(f'  streaming CSV (last_modified {modified or "unknown"})...')
    try:
        acc = stream_resource(session, url)
    except Exception as e:
        print(f'  ERROR streaming resource: {e}', file=sys.stderr)
        if os.path.exists(OUT_JSON):
            print('  keeping existing JSON', file=sys.stderr)
            return 1
        sys.exit(2)

    rows = finalize(acc)
    if not rows:
        existing = load_existing()
        if existing:
            print('  parsed 0 rows; keeping existing JSON', file=sys.stderr)
            return 1
        print('  parsed 0 rows and no existing JSON. Aborting.', file=sys.stderr)
        sys.exit(2)

    latest_month = max((r['mes'] for r in rows), default=None)
    write_json(
        OUT_JSON,
        rows,
        source='Secretaría de Energía — Perforación de pozos (Pozos terminados)',
        source_date=latest_month,
        resource_last_modified=modified or None,
    )
    write_csv(os.path.splitext(OUT_JSON)[0] + '.csv', rows,
              fieldnames=['mes', 'area', 'cuenca', 'provincia',
                          'pozos', 'pozos_pet', 'pozos_gas', 'pozos_serv', 'pozos_otros'])
    cache[RESOURCE_ID] = modified
    save_cache(cache)

    months = sorted({r['mes'] for r in rows})
    blocks = sorted({r['area'] for r in rows})
    total_last = sum(r['pozos'] for r in rows if r['mes'] == latest_month)
    print()
    print('pozos_terminados.json written')
    print(f'  rows={len(rows):,}  months={len(months)} ({months[0]} -> {months[-1]})  bloques={len(blocks)}')
    if latest_month:
        print(f'  ultimo mes {latest_month}: {total_last} pozos terminados en {TARGET_CUENCA}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
