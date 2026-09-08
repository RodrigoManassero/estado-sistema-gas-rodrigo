#!/usr/bin/env python3
"""Fetch the latest ENARGAS 'Proyección Semanal' (PS_YYYYMMDD.pdf) reports.

Same delivery mechanism as the RDS (see fetch_enargas.py): a listing page plus a
`descarga.php?path=proyeccion-semanal&file=PS_YYYYMMDD.pdf` endpoint. We scrape
the listing, extract the filenames, and download any we don't already have.
parse_enargas_ps.py turns them into enargas_ps.json.
"""

import os
import re
import sys
import requests

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
LIST_URL = 'https://www.enargas.gob.ar/secciones/transporte-y-distribucion/dod-proyeccion-semanal.php'
DOWNLOAD_URL = 'https://www.enargas.gob.ar/secciones/transporte-y-distribucion/descarga.php'
REPORT_PATH = 'proyeccion-semanal'


def looks_like_pdf(content: bytes) -> bool:
    return content[:5] == b'%PDF-'


def download(filename: str) -> bool:
    dest = os.path.join(RAW_DIR, filename)
    if os.path.exists(dest):
        print(f"  have {filename}")
        return True
    try:
        r = requests.get(
            DOWNLOAD_URL,
            params={'tipo': '', 'path': REPORT_PATH, 'file': filename},
            timeout=60,
        )
        r.raise_for_status()
    except Exception as e:
        print(f"  ERROR downloading {filename}: {e}", file=sys.stderr)
        return False
    if not looks_like_pdf(r.content):
        print(f"  SKIP {filename}: response not a PDF", file=sys.stderr)
        return False
    with open(dest, 'wb') as f:
        f.write(r.content)
    print(f"  OK   saved {filename} ({len(r.content)} bytes)")
    return True


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    try:
        r = requests.get(LIST_URL, timeout=30)
        r.raise_for_status()
    except Exception as e:
        print(f"ERROR fetching ENARGAS index: {e}", file=sys.stderr)
        return []

    # Links look like: onclick=DecargarPDF("","proyeccion-semanal","PS_20260602.pdf")
    filenames = re.findall(r'DecargarPDF\([^)]*"(PS_\d{8}\.pdf)"', r.text)
    seen = set()
    uniq = [f for f in filenames if not (f in seen or seen.add(f))]

    if not uniq:
        print("No PS filenames found on ENARGAS page")
        return []

    downloaded = []
    for fname in uniq[:5]:  # grab the 5 most recent so we have some history
        if download(fname):
            downloaded.append(os.path.join(RAW_DIR, fname))

    print(f"Fetched {len(downloaded)} PS PDFs")
    return downloaded


if __name__ == '__main__':
    main()
