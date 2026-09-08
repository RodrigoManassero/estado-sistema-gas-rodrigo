#!/usr/bin/env python3
"""Backfill historical ENARGAS ING reports.

Each ING_YYYYMMDD.pdf already contains 13 days of overlap (8 real + 5
programado), so a sparse weekly walk-back is enough to reconstruct the full
history. We walk back N calendar days, skip dates that 404 (weekends,
feriados), parse in-memory, and upsert by fecha. The newest report for a
given fecha always wins.

Usage:
    python scripts/backfill_enargas_ing.py --days 540
    python scripts/backfill_enargas_ing.py --days 30 --force
"""

import argparse
import io
import json
import os
import sys
import time
from datetime import date, timedelta

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402
from parse_enargas_ing import extract_ing, ING_CSV_COLS, ING_JSON  # noqa: E402

URL_TEMPLATE = (
    'https://www.enargas.gob.ar/secciones/transporte-y-distribucion/'
    'datos-operativos-despacho/graficos-programacion/6/ING_{ymd}.pdf'
)


def load_existing():
    if not os.path.exists(ING_JSON):
        return []
    with open(ING_JSON, encoding='utf-8') as f:
        raw = json.load(f)
    if isinstance(raw, dict) and 'data' in raw:
        return raw['data']
    return raw or []


def fetch_and_parse(target_date: date, session, tmp_dir: str):
    """Download one ING PDF in-memory, parse it, return list of rows or None."""
    fname = f'ING_{target_date.strftime("%Y%m%d")}.pdf'
    url = URL_TEMPLATE.format(ymd=target_date.strftime('%Y%m%d'))
    try:
        r = session.get(url, timeout=30)
    except requests.RequestException as e:
        return None, f'request error: {e}'
    if r.status_code != 200 or r.content[:5] != b'%PDF-':
        return None, f'status={r.status_code}'
    # extract_ing reads from a path; write to a transient temp file.
    tmp_path = os.path.join(tmp_dir, fname)
    with open(tmp_path, 'wb') as f:
        f.write(r.content)
    try:
        rows = extract_ing(tmp_path)
    except Exception as e:
        return None, f'parse error: {e}'
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    return rows, None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--days', type=int, default=540, help='how many days back to try (~18 months covers ENARGAS history)')
    parser.add_argument('--force', action='store_true', help='re-download dates we already have a source for')
    parser.add_argument('--sleep-ms', type=int, default=150, help='delay between requests')
    parser.add_argument('--step-days', type=int, default=1, help='stride when walking back; 1=every day, 7=weekly anchor')
    args = parser.parse_args()

    existing = load_existing()
    have = {r['fecha']: r for r in existing if r.get('fecha')}
    have_sources = {r.get('source') for r in existing if r.get('source')}
    print(f"Starting with {len(have)} existing ING rows")

    session = requests.Session()
    tmp_dir = os.path.join(os.path.dirname(__file__), '..', 'raw', '_tmp')
    os.makedirs(tmp_dir, exist_ok=True)

    fetched_pdfs = 0
    upserted = 0
    failures = []
    today = date.today()

    for offset in range(0, args.days + 1, args.step_days):
        d = today - timedelta(days=offset)
        fname = f'ING_{d.strftime("%Y%m%d")}.pdf'
        if fname in have_sources and not args.force:
            continue
        rows, err = fetch_and_parse(d, session, tmp_dir)
        time.sleep(args.sleep_ms / 1000)
        if rows is None:
            # 404 = weekend/feriado, expected; only log other errors loudly.
            if err and 'status=404' not in err:
                failures.append(f'{d.isoformat()}: {err}')
            continue
        fetched_pdfs += 1
        for r in rows:
            if r.get('fecha'):
                # Latest report wins for any given fecha. Since we walk back
                # in time, only overwrite if the new row's source is newer
                # than the existing one.
                prev = have.get(r['fecha'])
                if prev is None or (r.get('source') or '') > (prev.get('source') or ''):
                    have[r['fecha']] = r
                    upserted += 1
        if fetched_pdfs % 20 == 0:
            print(f"  progress: {fetched_pdfs} PDFs fetched, {len(have)} unique fechas")

    rows = sorted(have.values(), key=lambda r: r.get('fecha') or '')
    latest = rows[-1]['fecha'] if rows else None
    write_json(
        ING_JSON,
        rows,
        source='ENARGAS ING (backfilled)',
        source_date=latest,
        failures=failures[-50:],
    )
    write_csv(json_to_csv_path(ING_JSON), rows, fieldnames=ING_CSV_COLS)
    print(f"\nenargas_ing.json: {len(rows)} total rows ({fetched_pdfs} PDFs fetched, {upserted} upserts)")
    if failures:
        print(f"  {len(failures)} dates failed (see envelope.failures)")


if __name__ == '__main__':
    main()
