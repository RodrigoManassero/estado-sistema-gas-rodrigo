#!/usr/bin/env python3
"""Backfill historical ENARGAS 'Proyección Semanal' (PS) reports.

Like backfill_enargas.py: the download endpoint accepts any past date even
though the listing page only shows the last few. We walk back N days, download
PS_<date>.pdf, parse the REAL column (the actuals for date-1), and upsert by
fecha into enargas_ps.json.

PS is published on business days, so weekends/holidays will simply 404 — those
are expected misses, not errors.

We don't keep the PDFs; they're streamed to memory, parsed, and discarded.

Usage:
    python scripts/backfill_enargas_ps.py --days 365
    python scripts/backfill_enargas_ps.py --days 730 --force
"""

import argparse
import json
import os
import sys
import time
from datetime import date, timedelta

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402
from parse_enargas_ps import extract_ps, PS_JSON, PS_FIELDS  # noqa: E402

DOWNLOAD_URL = 'https://www.enargas.gob.ar/secciones/transporte-y-distribucion/descarga.php'


def load_existing():
    if not os.path.exists(PS_JSON):
        return {}
    with open(PS_JSON, encoding='utf-8') as f:
        raw = json.load(f)
    data = raw.get('data', raw) if isinstance(raw, dict) else raw
    return {r['fecha']: r for r in (data or []) if r.get('fecha')}


def fetch_and_parse(report_date: date, session):
    fname = f'PS_{report_date.strftime("%Y%m%d")}.pdf'
    try:
        r = session.get(
            DOWNLOAD_URL,
            params={'tipo': '', 'path': 'proyeccion-semanal', 'file': fname},
            timeout=30,
        )
    except requests.RequestException as e:
        return None, f'request error: {e}'
    if r.status_code != 200 or r.content[:5] != b'%PDF-':
        return None, f'status={r.status_code} not-pdf'
    try:
        real_row, _fc, iss = extract_ps(r.content, report_date=report_date)
    except Exception as e:  # noqa: BLE001
        return None, f'parse error: {e}'
    if not real_row or not real_row.get('fecha'):
        return None, 'no REAL row'
    real_row['source'] = fname
    return real_row, (iss[0] if iss else None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--days', type=int, default=365, help='how many days back to try')
    parser.add_argument('--force', action='store_true', help='re-download dates we already have')
    parser.add_argument('--sleep-ms', type=int, default=150, help='delay between requests')
    args = parser.parse_args()

    have = load_existing()
    print(f"Starting with {len(have)} existing PS rows in enargas_ps.json")

    session = requests.Session()
    added = 0
    skipped = 0
    failures = []

    today = date.today()
    for offset in range(1, args.days + 1):
        report_d = today - timedelta(days=offset)
        real_iso = (report_d - timedelta(days=1)).isoformat()  # REAL = report - 1
        if real_iso in have and not args.force:
            skipped += 1
            continue
        row, err = fetch_and_parse(report_d, session)
        if row is None:
            failures.append(f'{report_d.isoformat()}: {err}')
            time.sleep(args.sleep_ms / 1000)
            continue
        have[row['fecha']] = row
        added += 1
        if added % 20 == 0:
            print(f"  progress: +{added}, last fecha={row['fecha']} LP_TGN={row.get('linepack_tgn')}")
        time.sleep(args.sleep_ms / 1000)

    rows = sorted(have.values(), key=lambda r: r.get('fecha') or '')
    latest = rows[-1]['fecha'] if rows else None
    write_json(
        PS_JSON, rows,
        source='ENARGAS Proyección Semanal (PS) — columna REAL (backfilled)',
        source_date=latest,
        issues=failures[-50:],
    )
    write_csv(json_to_csv_path(PS_JSON),
              ({k: r.get(k) for k in PS_FIELDS} for r in rows),
              fieldnames=PS_FIELDS)
    print(f"\nenargas_ps.json: {len(rows)} rows ({added} added, {skipped} already had)")
    if failures:
        print(f"  {len(failures)} dates failed/missing (weekends & holidays expected)")


if __name__ == '__main__':
    main()
