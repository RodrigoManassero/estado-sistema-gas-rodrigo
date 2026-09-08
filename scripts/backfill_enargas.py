#!/usr/bin/env python3
"""Backfill historical ENARGAS RDS daily reports.

The ENARGAS download endpoint accepts any past date; the listing page only
shows the last ~5 days but the files behind are there. This script walks
back N days, downloads missing reports, parses them, and merges into
enargas.json.

We don't keep the PDFs: they're bulky (~70 KB–650 KB each, 365 days ≈ 150 MB)
and the dashboard only needs the extracted fields. PDFs are streamed to a
temp path, parsed, then discarded.

Usage:
    python scripts/backfill_enargas.py --days 365
    python scripts/backfill_enargas.py --days 730 --force
"""

import argparse
import io
import json
import os
import sys
import time
from datetime import date, timedelta

import requests
import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402
from parse_enargas import extract_rds, flatten_for_csv, ENARGAS_CSV_COLS  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
ENARGAS_JSON = os.path.join(OUT_DIR, 'enargas.json')
DOWNLOAD_URL = 'https://www.enargas.gob.ar/secciones/transporte-y-distribucion/descarga.php'


def load_existing():
    if not os.path.exists(ENARGAS_JSON):
        return []
    with open(ENARGAS_JSON, encoding='utf-8') as f:
        raw = json.load(f)
    if isinstance(raw, dict) and 'data' in raw:
        return raw['data']
    return raw or []


def fetch_and_parse(target_date: date, session):
    """Fetch RDS for a given date, parse, return dict or None (missing/bad)."""
    fname = f'RDS_{target_date.strftime("%Y%m%d")}.pdf'
    try:
        r = session.get(
            DOWNLOAD_URL,
            params={'tipo': '', 'path': 'reporte-diario-sistema', 'file': fname},
            timeout=30,
        )
    except requests.RequestException as e:
        return None, f'request error: {e}'
    if r.status_code != 200 or r.content[:5] != b'%PDF-':
        return None, f'status={r.status_code} not-pdf={r.content[:10]!r}'
    try:
        with pdfplumber.open(io.BytesIO(r.content)) as pdf:
            text = '\n'.join((p.extract_text() or '') for p in pdf.pages)
        row = extract_rds(text)
        row['source'] = fname
    except Exception as e:
        return None, f'parse error: {e}'
    if not row.get('fecha'):
        return None, 'missing fecha after parse'
    return row, None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--days', type=int, default=365, help='how many days back to try')
    parser.add_argument('--force', action='store_true', help='re-download dates we already have')
    parser.add_argument('--sleep-ms', type=int, default=150, help='delay between requests')
    args = parser.parse_args()

    existing = load_existing()
    have = {r['fecha']: r for r in existing if r.get('fecha')}
    print(f"Starting with {len(have)} existing RDS rows in enargas.json")

    session = requests.Session()
    added = 0
    skipped = 0
    failures = []

    today = date.today()
    for offset in range(1, args.days + 1):
        d = today - timedelta(days=offset)
        iso = d.isoformat()
        if iso in have and not args.force:
            skipped += 1
            continue
        row, err = fetch_and_parse(d, session)
        if row is None:
            failures.append(f'{iso}: {err}')
            # Rate-limit even on failures to be polite
            time.sleep(args.sleep_ms / 1000)
            continue
        have[iso] = row
        added += 1
        if added % 20 == 0:
            print(f"  progress: +{added} so far, last={iso} LP={row.get('linepack_total')}")
        time.sleep(args.sleep_ms / 1000)

    rows = sorted(have.values(), key=lambda r: r.get('fecha') or '')
    latest = rows[-1]['fecha'] if rows else None
    write_json(
        ENARGAS_JSON,
        rows,
        source='ENARGAS RDS (backfilled)',
        source_date=latest,
        failures=failures[-50:],  # truncate to avoid huge logs
    )
    write_csv(
        json_to_csv_path(ENARGAS_JSON),
        (flatten_for_csv(r) for r in rows),
        fieldnames=ENARGAS_CSV_COLS,
    )
    print(f"\nenargas.json: {len(rows)} total rows ({added} added, {skipped} already had)")
    if failures:
        print(f"  {len(failures)} dates failed (see 'failures' in envelope metadata)")


if __name__ == '__main__':
    main()
