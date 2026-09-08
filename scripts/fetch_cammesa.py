#!/usr/bin/env python3
"""Fetch the latest CAMMESA weekly dispatch outlook.

CAMMESA used to publish a daily 'PS_YYYYMMDD.pdf' on cammesaweb that
included gas + electricity day-by-day. In 2026 they migrated the public
download to a WordPress download manager and merged the daily detail
into a weekly executive PDF, 'PrevisionDespachoEnergetico.pdf', served
via /?wpdmdl=44795.

We download that PDF on every pipeline run and timestamp it with the
date the run sees it (the PDF itself doesn't have a stable filename and
overwrites in place upstream). parse_cammesa.py reads the most recent
one and extracts the weekly tables.
"""

import os
from datetime import datetime, timezone

import requests

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
PDF_URL = 'https://cammesaweb.cammesa.com/?wpdmdl=44795'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}


def looks_like_pdf(content: bytes) -> bool:
    return content[:5] == b'%PDF-'


def fetch_cammesa_weekly():
    os.makedirs(RAW_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d')
    dest = os.path.join(RAW_DIR, f'PrevisionDespachoEnergetico_{stamp}.pdf')
    if os.path.exists(dest):
        print(f"Already have {os.path.basename(dest)}")
        return dest
    try:
        r = requests.get(PDF_URL, headers=HEADERS, timeout=60, allow_redirects=True)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"FAILED: HTTP error fetching CAMMESA: {e}")
        return None
    if not looks_like_pdf(r.content):
        print(f"FAILED: response is not a PDF (first bytes {r.content[:10]!r})")
        return None
    with open(dest, 'wb') as f:
        f.write(r.content)
    print(f"Saved {os.path.basename(dest)} ({len(r.content)} bytes)")
    return dest


if __name__ == '__main__':
    result = fetch_cammesa_weekly()
    if result:
        print(f"OK: {result}")
    else:
        print("FAILED: Could not fetch CAMMESA PDF")
