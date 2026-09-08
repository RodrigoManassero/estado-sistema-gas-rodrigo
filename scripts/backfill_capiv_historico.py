#!/usr/bin/env python3
"""One-shot backfill: cumulative Cap IV production per block since 2006.

The daily `fetch_capiv.py` only keeps a 2-year window of monthly rows in
`produccion_neuquina.json` (kept small so the dashboard loads fast). This
script downloads every available yearly CSV from datos.energia.gob.ar (Cap IV)
and produces a separate, small JSON with just the lifetime cumulative numbers
per (area, empresa):

    public/data/produccion_neuquina_historico.json

Shape of each row:
    {
        "area":               "FORTIN DE PIEDRA",
        "empresa":            "TECPETROL S.A.",
        "gas_acumulado_mm3":  12345.6,                # MMm³ (million m³)
        "pet_acumulado_m3":   45678901.0,             # m³
        "agua_acumulada_m3":  2345678.0,              # m³
        "primer_mes":         "2018-03",
        "ultimo_mes":         "2026-04",
        "meses_activos":      98,                     # months with any production
        "anios_cubiertos":    [2018, 2019, ..., 2026]
    }

Downloads run in parallel (default 4 workers). Cap IV publishes ~20 yearly
CSVs of ~300 MB each; expect 3-10 minutes total depending on bandwidth.

Usage:
    python scripts/backfill_capiv_historico.py
    python scripts/backfill_capiv_historico.py --since 2015 --workers 6
"""

import argparse
import csv
import io
import json
import os
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
OUT_PATH = os.path.join(OUT_DIR, 'produccion_neuquina_historico.json')

DATASET_ID = 'c846e79c-026c-4040-897f-1ad3543b407c'
CKAN_BASE = 'http://datos.energia.gob.ar/api/3/action'

TARGET_CUENCA = 'NEUQUINA'
HDRS = {'User-Agent': 'Mozilla/5.0 Chrome/130 estado-red-gas'}


def _session() -> requests.Session:
    s = requests.Session()
    retry = Retry(total=5, backoff_factor=2.0,
                  status_forcelist=(500, 502, 503, 504),
                  allowed_methods=frozenset(['GET']))
    s.mount('http://', HTTPAdapter(max_retries=retry))
    s.mount('https://', HTTPAdapter(max_retries=retry))
    return s


def list_yearly_resources(session: requests.Session) -> dict:
    """Return {year: resource} for plain (non-DDJJ) yearly CSVs."""
    r = session.get(f'{CKAN_BASE}/package_show',
                    params={'id': DATASET_ID}, headers=HDRS, timeout=60)
    r.raise_for_status()
    pkg = r.json()['result']

    plain_by_year, ddjj_by_year = {}, {}
    for res in pkg.get('resources', []):
        if (res.get('format') or '').upper() != 'CSV':
            continue
        name = (res.get('name') or '').strip()
        if 'Producción de Pozos de Gas y Petróleo' not in name:
            continue
        year = None
        for token in name.replace('-', ' ').replace('(', ' ').split():
            if len(token) == 4 and token.isdigit() and 2000 <= int(token) <= 2100:
                year = int(token)
        if year is None:
            continue
        bucket = ddjj_by_year if 'DDJJ' in name else plain_by_year
        prev = bucket.get(year)
        if prev is None or (res.get('last_modified') or '') > (prev.get('last_modified') or ''):
            bucket[year] = res

    out = {}
    for year in sorted(set(plain_by_year) | set(ddjj_by_year)):
        out[year] = plain_by_year.get(year) or ddjj_by_year[year]
    return out


def stream_year(session: requests.Session, resource: dict) -> dict:
    """Stream one yearly CSV, filter NEUQUINA, return per-(area, empresa) totals."""
    url = resource['url']
    local: dict = defaultdict(lambda: {
        'gas': 0.0, 'pet': 0.0, 'agua': 0.0,
        'meses': set(), 'anios': set(),
    })

    with session.get(url, headers=HDRS, stream=True, timeout=600) as r:
        r.raise_for_status()
        r.encoding = 'utf-8'
        lines = r.iter_lines(decode_unicode=True)
        first = next(lines, '') or ''
        if first.startswith('﻿'):
            first = first[1:]
        reader = csv.DictReader(_chain_first(first, lines))
        kept = 0
        for row in reader:
            if (row.get('cuenca') or '').strip().upper() != TARGET_CUENCA:
                continue
            kept += 1
            try:
                year = int(row['anio'])
                month = int(row['mes'])
            except (KeyError, ValueError, TypeError):
                continue
            area = (row.get('areapermisoconcesion') or '').strip() or 'SIN ÁREA'
            empresa = (row.get('empresa') or '').strip() or 'SIN EMPRESA'
            gas = _safe_float(row.get('prod_gas'))
            pet = _safe_float(row.get('prod_pet'))
            agua = _safe_float(row.get('prod_agua'))
            if gas == 0 and pet == 0:
                # Skip injectors / inactive wells from totals; still log them
                # if you want to count, but the cumulative is about production.
                pass
            bucket = local[(area, empresa)]
            bucket['gas'] += gas
            bucket['pet'] += pet
            bucket['agua'] += agua
            if gas > 0 or pet > 0:
                bucket['meses'].add(f'{year:04d}-{month:02d}')
                bucket['anios'].add(year)

    return {
        'year': int(resource.get('_year', 0)) or None,
        'kept': kept,
        'local': dict(local),
    }


def _chain_first(first, rest):
    yield first
    yield from rest


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


def merge_year_result(global_acc: dict, year_result: dict):
    """Merge one year's per-(area, empresa) totals into the global accumulator."""
    for key, slot in year_result['local'].items():
        g = global_acc.get(key)
        if g is None:
            g = {
                'gas': 0.0, 'pet': 0.0, 'agua': 0.0,
                'meses': set(), 'anios': set(),
            }
            global_acc[key] = g
        g['gas'] += slot['gas']
        g['pet'] += slot['pet']
        g['agua'] += slot['agua']
        g['meses'].update(slot['meses'])
        g['anios'].update(slot['anios'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--since', type=int, default=2006,
                        help='Earliest year to include (default 2006, the start of Cap IV).')
    parser.add_argument('--until', type=int, default=None,
                        help='Latest year to include (default: current).')
    parser.add_argument('--workers', type=int, default=4,
                        help='Parallel downloads (default 4).')
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    session = _session()
    print(f'Listing yearly resources from CKAN...')
    resources = list_yearly_resources(session)
    if not resources:
        print('ERROR: no yearly production resources found', file=sys.stderr)
        sys.exit(1)

    today_year = datetime.now(timezone.utc).year
    until = args.until or today_year
    target_years = sorted(y for y in resources if args.since <= y <= until)
    print(f'Target years ({len(target_years)}): {target_years}')

    global_acc: dict = {}
    total_kept = 0
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        # Annotate each resource with its year so the worker can label results.
        for y in target_years:
            resources[y]['_year'] = y
        futures = {pool.submit(stream_year, _session(), resources[y]): y for y in target_years}
        for fut in as_completed(futures):
            y = futures[fut]
            try:
                result = fut.result()
                merge_year_result(global_acc, result)
                total_kept += result['kept']
                size_mb = (resources[y].get('size') or 0) / 1024 / 1024
                print(f'  done {y}: kept {result["kept"]:>7,} Neuquina rows '
                      f'from {size_mb:.0f} MB CSV')
            except Exception as e:
                errors.append(f'year {y}: {e}')
                print(f'  FAIL {y}: {e}', file=sys.stderr)

    if not global_acc:
        print('No rows accumulated. Aborting.', file=sys.stderr)
        sys.exit(2)

    rows = []
    for (area, empresa), bucket in global_acc.items():
        meses_sorted = sorted(bucket['meses'])
        anios_sorted = sorted(bucket['anios'])
        rows.append({
            'area': area,
            'empresa': empresa,
            'gas_acumulado_mm3': round(bucket['gas'] / 1000.0, 2),  # dam³ → MMm³
            'pet_acumulado_m3': round(bucket['pet'], 2),
            'agua_acumulada_m3': round(bucket['agua'], 2),
            'primer_mes': meses_sorted[0] if meses_sorted else None,
            'ultimo_mes': meses_sorted[-1] if meses_sorted else None,
            'meses_activos': len(meses_sorted),
            'anios_cubiertos': anios_sorted,
        })
    rows.sort(key=lambda r: (-r['gas_acumulado_mm3'], r['area']))

    rango = f'{target_years[0]}-{target_years[-1]}'
    write_json(
        OUT_PATH,
        rows,
        source='Secretaría de Energía — Capítulo IV (datos.energia.gob.ar) — agregado histórico',
        source_date=rango,
        rango=rango,
        years=target_years,
        errors=errors or None,
    )

    print()
    print(f'{OUT_PATH}')
    print(f'  rows={len(rows):,}  total Neuquina well-month rows scanned={total_kept:,}')
    top = rows[:10]
    print('\nTop 10 bloques por gas acumulado:')
    for r in top:
        print(f"  {r['area']:35s} {r['empresa']:30s}  "
              f"gas={r['gas_acumulado_mm3']:>10,.0f} MMm³  "
              f"{r['primer_mes']}..{r['ultimo_mes']}")
    if errors:
        print(f'\nWARN: {len(errors)} errors: {errors}', file=sys.stderr)


if __name__ == '__main__':
    main()
