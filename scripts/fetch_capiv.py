#!/usr/bin/env python3
"""Fetch Capítulo IV — Secretaría de Energía monthly well-level production.

Source: datos.energia.gob.ar CKAN dataset
  "Producción de petróleo y gas por pozo (Capítulo IV)"
  package id c846e79c-026c-4040-897f-1ad3543b407c

The dataset publishes one CSV per calendar year, each ~100-330 MB, with one
row per (well, month). We stream the file, keep only Neuquén basin rows, and
aggregate to (mes, areapermisoconcesion, empresa) so the dashboard payload is
small (~hundreds of rows per month instead of tens of thousands).

Output:
  public/data/produccion_neuquina.json  (envelope {generated_at, source, source_date, data: [rows]})
  public/data/produccion_neuquina.csv

Aggregated row shape:
  {
    'mes':                 'YYYY-MM',
    'area':                'LOMA CAMPANA',          # areapermisoconcesion (concesión / bloque)
    'empresa':             'YPF S.A.',
    'cuenca':              'NEUQUINA',
    'provincia':           'Neuquén',               # most common in this group
    'prod_gas_mm3':        12345.6,                  # gas, miles de m³ (=1 dam³)
    'prod_pet_m3':         8765.4,                   # petróleo, m³
    'prod_agua_m3':        4321.0,
    'pozos_activos':       42,                       # wells with prod_gas>0 or prod_pet>0 in the month
    'pozos_no_conv':       30,                       # wells where tipo_de_recurso != CONVENCIONAL
  }

Usage:
  python scripts/fetch_capiv.py                # current + previous year (delta refresh)
  python scripts/fetch_capiv.py --years 5      # backfill more years
  python scripts/fetch_capiv.py --force        # ignore Last-Modified cache, re-download everything
"""

import argparse
import csv
import io
import json
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
OUT_JSON = os.path.join(OUT_DIR, 'produccion_neuquina.json')

DATASET_ID = 'c846e79c-026c-4040-897f-1ad3543b407c'
CKAN_BASE = 'http://datos.energia.gob.ar/api/3/action'
# A small ETag-ish cache so we don't redownload 300MB files when they haven't changed.
CACHE_PATH = os.path.join(os.path.dirname(__file__), '.capiv_cache.json')

HDRS = {'User-Agent': 'Mozilla/5.0 Chrome/130 estado-red-gas'}
TARGET_CUENCA = 'NEUQUINA'


def list_yearly_resources(session: requests.Session) -> dict[int, dict]:
    """Return {year: resource_dict} for the per-year production CSVs.

    There are two flavors per year:
      "Producción de Pozos de Gas y Petróleo - YYYY"
      "Producción de Pozos de Gas y Petróleo - YYYY (DDJJ abiertas y cerradas)"
    We prefer the plain (no DDJJ suffix) flavor — that's the consolidated one.
    If only the DDJJ one is available for a given year we fall back to it.
    """
    r = session.get(f'{CKAN_BASE}/package_show',
                    params={'id': DATASET_ID}, headers=HDRS, timeout=60)
    r.raise_for_status()
    pkg = r.json()['result']

    plain_by_year: dict[int, dict] = {}
    ddjj_by_year: dict[int, dict] = {}
    for res in pkg.get('resources', []):
        name = (res.get('name') or '').strip()
        if res.get('format', '').upper() != 'CSV':
            continue
        # Match "...Petróleo - 2025" or "...Petróleo 2018" (some years no dash).
        # Skip names that don't start with a production-by-well marker.
        if 'Producción de Pozos de Gas y Petróleo' not in name:
            continue
        # Find a 4-digit year at the tail of the name.
        year = None
        for token in name.replace('-', ' ').replace('(', ' ').split():
            if len(token) == 4 and token.isdigit() and 2000 <= int(token) <= 2100:
                year = int(token)
        if year is None:
            continue
        # Prefer plain over DDJJ; among duplicates of the same flavor, prefer
        # the most recently modified resource.
        bucket = ddjj_by_year if 'DDJJ' in name else plain_by_year
        prev = bucket.get(year)
        if prev is None or (res.get('last_modified') or '') > (prev.get('last_modified') or ''):
            bucket[year] = res

    out: dict[int, dict] = {}
    for year in sorted(set(plain_by_year) | set(ddjj_by_year)):
        out[year] = plain_by_year.get(year) or ddjj_by_year[year]
    return out


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


def stream_year(session: requests.Session, resource: dict, accumulator: dict) -> tuple[int, int]:
    """Stream one yearly CSV, filter by cuenca, accumulate aggregates in place.

    Returns (rows_seen, rows_kept).
    """
    url = resource['url']
    with session.get(url, headers=HDRS, stream=True, timeout=600) as r:
        r.raise_for_status()
        r.encoding = 'utf-8'
        # Strip the byte-order mark if present; csv.DictReader handles the rest.
        lines = r.iter_lines(decode_unicode=True)
        first = next(lines, '')
        if first.startswith('﻿'):
            first = first[1:]
        reader = csv.DictReader(_chain_first(first, lines))
        rows_seen = 0
        rows_kept = 0
        for row in reader:
            rows_seen += 1
            if (row.get('cuenca') or '').strip().upper() != TARGET_CUENCA:
                continue
            rows_kept += 1
            _accumulate(accumulator, row)
        return rows_seen, rows_kept


def _chain_first(first: str, rest):
    yield first
    yield from rest


def _accumulate(acc: dict, row: dict):
    """Aggregate a single well-month row. CSV units (per SE schema):
      prod_gas in dam³ (= 1000 m³ = mil m³)
      prod_pet in m³
      prod_agua in m³
    """
    try:
        year = int(row['anio'])
        month = int(row['mes'])
    except (KeyError, ValueError, TypeError):
        return
    mes = f'{year:04d}-{month:02d}'
    area = (row.get('areapermisoconcesion') or '').strip() or 'SIN ÁREA'
    empresa = (row.get('empresa') or '').strip() or 'SIN EMPRESA'
    key = (mes, area, empresa)
    bucket = acc.get(key)
    if bucket is None:
        bucket = {
            'mes': mes,
            'area': area,
            'empresa': empresa,
            'cuenca': row.get('cuenca'),
            'provincia_counts': defaultdict(int),
            'prod_gas_dam3': 0.0,
            'prod_pet_m3': 0.0,
            'prod_agua_m3': 0.0,
            'pozos_activos': 0,
            'pozos_no_conv': 0,
        }
        acc[key] = bucket
    gas = _safe_float(row.get('prod_gas'))
    pet = _safe_float(row.get('prod_pet'))
    agua = _safe_float(row.get('prod_agua'))
    bucket['prod_gas_dam3'] += gas
    bucket['prod_pet_m3'] += pet
    bucket['prod_agua_m3'] += agua
    if gas > 0 or pet > 0:
        bucket['pozos_activos'] += 1
    if (row.get('tipo_de_recurso') or '').strip().upper() != 'CONVENCIONAL':
        bucket['pozos_no_conv'] += 1
    prov = (row.get('provincia') or '').strip()
    if prov:
        bucket['provincia_counts'][prov] += 1


def _safe_float(x):
    if x is None:
        return 0.0
    s = str(x).strip().replace(',', '.')
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def finalize(acc: dict) -> list[dict]:
    rows = []
    for bucket in acc.values():
        # Pick the most common provincia within the bucket (block can span
        # provinces but one usually dominates).
        provincia_counts = bucket.pop('provincia_counts')
        provincia = max(provincia_counts, key=provincia_counts.get) if provincia_counts else ''
        rows.append({
            'mes': bucket['mes'],
            'area': bucket['area'],
            'empresa': bucket['empresa'],
            'cuenca': bucket['cuenca'],
            'provincia': provincia,
            # dam³ / 1000 = MMm³ (million m³) for the month. Fits on chart axis.
            'prod_gas_mm3': round(bucket['prod_gas_dam3'] / 1000.0, 2),
            'prod_pet_m3': round(bucket['prod_pet_m3'], 2),
            'prod_agua_m3': round(bucket['prod_agua_m3'], 2),
            'pozos_activos': bucket['pozos_activos'],
            'pozos_no_conv': bucket['pozos_no_conv'],
        })
    rows.sort(key=lambda r: (r['mes'], -r['prod_gas_mm3'], r['area']))
    return rows


def load_existing_by_month() -> dict[str, list[dict]]:
    """Existing JSON rows grouped by 'mes', so we can replace months we re-fetched
    and keep older months untouched."""
    if not os.path.exists(OUT_JSON):
        return {}
    with open(OUT_JSON, encoding='utf-8') as f:
        raw = json.load(f)
    rows = raw.get('data', raw) if isinstance(raw, dict) else raw
    by_month: dict[str, list[dict]] = {}
    for row in (rows or []):
        m = row.get('mes')
        if m:
            by_month.setdefault(m, []).append(row)
    return by_month


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--years', type=int, default=2,
                        help='How many recent years to fetch (default 2: current + previous).')
    parser.add_argument('--force', action='store_true',
                        help='Ignore Last-Modified cache and re-download everything.')
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    session = requests.Session()

    print('Listing yearly resources from CKAN...')
    resources = list_yearly_resources(session)
    if not resources:
        print('ERROR: no yearly production resources found via CKAN package_show', file=sys.stderr)
        sys.exit(1)
    current_year = date.today().year
    target_years = sorted(y for y in resources if (current_year - args.years) < y <= current_year)
    if not target_years:
        # Fall back to whatever the dataset has if e.g. current year isn't published yet.
        target_years = sorted(resources)[-args.years:]
    print(f'Target years: {target_years}')

    cache = {} if args.force else load_cache()
    accumulator: dict = {}
    fetched_years: list[int] = []
    errors: list[str] = []

    for year in target_years:
        res = resources[year]
        modified = res.get('last_modified') or ''
        cache_key = str(year)
        if not args.force and cache.get(cache_key) == modified and os.path.exists(OUT_JSON):
            print(f'  {year}: unchanged since last run ({modified}), skipping')
            continue
        size_mb = (res.get('size') or 0) / 1024 / 1024
        print(f'  {year}: streaming {size_mb:.1f} MB (last_modified {modified})...')
        try:
            seen, kept = stream_year(session, res, accumulator)
            print(f'    rows seen={seen:,}  Neuquina kept={kept:,}')
            cache[cache_key] = modified
            fetched_years.append(year)
        except Exception as e:
            errors.append(f'year {year}: {e}')
            print(f'    ERROR: {e}', file=sys.stderr)

    if not accumulator and not os.path.exists(OUT_JSON):
        print('No data accumulated and no existing JSON. Aborting.', file=sys.stderr)
        sys.exit(2)

    new_rows = finalize(accumulator) if accumulator else []
    by_month = load_existing_by_month()
    # Replace every month we touched in this run; keep older untouched months.
    touched_months = {r['mes'] for r in new_rows}
    for m in touched_months:
        by_month[m] = [r for r in new_rows if r['mes'] == m]

    merged = [r for m in sorted(by_month) for r in by_month[m]]
    latest_month = max((r['mes'] for r in merged), default=None)

    write_json(
        OUT_JSON,
        merged,
        source='Secretaría de Energía — Capítulo IV (datos.energia.gob.ar)',
        source_date=latest_month,
        years_fetched=fetched_years,
        errors=errors or None,
    )
    write_csv(os.path.splitext(OUT_JSON)[0] + '.csv', merged,
              fieldnames=['mes', 'area', 'empresa', 'cuenca', 'provincia',
                          'prod_gas_mm3', 'prod_pet_m3', 'prod_agua_m3',
                          'pozos_activos', 'pozos_no_conv'])
    save_cache(cache)

    months = sorted({r['mes'] for r in merged})
    blocks = sorted({r['area'] for r in merged})
    total_last = sum(r['prod_gas_mm3'] for r in merged if r['mes'] == latest_month)
    print()
    print(f'produccion_neuquina.json written')
    print(f'  rows={len(merged):,}  months={len(months)} ({months[0]} -> {months[-1]})  bloques={len(blocks)}')
    if latest_month:
        days = _days_in_month(latest_month)
        print(f'  ultimo mes {latest_month}: gas {total_last:,.0f} MMm3/mes '
              f'(~{total_last / days:,.1f} MMm3/d)')
    if errors:
        print(f'  WARN: {len(errors)} errors: {errors}', file=sys.stderr)


def _days_in_month(mes: str) -> int:
    y, m = (int(x) for x in mes.split('-'))
    if m == 12:
        next_first = date(y + 1, 1, 1)
    else:
        next_first = date(y, m + 1, 1)
    return (next_first - date(y, m, 1)).days


if __name__ == '__main__':
    main()
