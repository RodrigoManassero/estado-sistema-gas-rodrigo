#!/usr/bin/env python3
"""Fetch the most recent ENARGAS ING (Inyección Nacional por Gasoducto) PDFs.

ENARGAS publishes the Power BI export at
https://www.enargas.gob.ar/secciones/transporte-y-distribucion/datos-operativos-despacho/graficos-programacion/6/ING_YYYYMMDD.pdf

The URL is deterministic by date (no listing scrape needed). We try the last
N business days; missing dates (weekends, feriados) just 404 and we move on.
The parser handles upsert by fecha so re-running is idempotent.
"""

import os
import sys
from datetime import date, timedelta

import requests

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
URL_TEMPLATE = (
    'https://www.enargas.gob.ar/secciones/transporte-y-distribucion/'
    'datos-operativos-despacho/graficos-programacion/6/ING_{ymd}.pdf'
)
DAYS_BACK = 10  # tries last 10 calendar days; ~5-7 PDFs land on business days


def looks_like_pdf(content: bytes) -> bool:
    return content[:5] == b'%PDF-'


def download(target_date: date, session) -> bool:
    fname = f'ING_{target_date.strftime("%Y%m%d")}.pdf'
    dest = os.path.join(RAW_DIR, fname)
    if os.path.exists(dest):
        print(f"  have {fname}")
        return True
    url = URL_TEMPLATE.format(ymd=target_date.strftime('%Y%m%d'))
    try:
        r = session.get(url, timeout=30)
    except requests.RequestException as e:
        print(f"  ERROR downloading {fname}: {e}", file=sys.stderr)
        return False
    if r.status_code != 200 or not looks_like_pdf(r.content):
        # 404 on weekends / feriados is expected; quiet.
        return False
    with open(dest, 'wb') as f:
        f.write(r.content)
    print(f"  OK   saved {fname} ({len(r.content)} bytes)")
    return True


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    session = requests.Session()
    today = date.today()
    downloaded = 0
    for offset in range(0, DAYS_BACK + 1):
        d = today - timedelta(days=offset)
        if download(d, session):
            downloaded += 1
    print(f"Fetched {downloaded} ING PDFs (or already had them)")


if __name__ == '__main__':
    main()
