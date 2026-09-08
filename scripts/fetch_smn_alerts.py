#!/usr/bin/env python3
"""Fetch active weather alerts from SMN open-data endpoint.

The main SMN site (www.smn.gob.ar/alertas) is behind Cloudflare and returns
403 to plain HTTP clients. The government open-data mirror at
ssl.smn.gob.ar/dpd/zipopendata.php is public, serves a tiny ZIP with a TXT
inside, and updates as alerts are issued.

Each line in the TXT corresponds to an active alert with fields:
    fecha_hora | numero | zona | fenomeno | situacion | descripcion
separated by tabs. The file is empty when no alerts are active.
"""

import io
import os
import sys
import zipfile

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
URL = 'https://ssl.smn.gob.ar/dpd/zipopendata.php?dato=alertas'
ALERTS_CSV_COLS = ['fecha_hora', 'numero', 'zona', 'fenomeno', 'situacion', 'descripcion']


def parse_alerts_text(text: str):
    """Parse tab-separated alert lines. Structure is loose — we keep raw text
    too so the UI can render even if columns shift."""
    alerts = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split('\t')
        # Pad to known columns
        while len(parts) < 6:
            parts.append('')
        alerts.append({
            'fecha_hora': parts[0].strip(),
            'numero': parts[1].strip(),
            'zona': parts[2].strip(),
            'fenomeno': parts[3].strip(),
            'situacion': parts[4].strip(),
            'descripcion': parts[5].strip(),
            'raw': line,
        })
    return alerts


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        r = requests.get(
            URL,
            headers={'User-Agent': 'Mozilla/5.0 Chrome/130 estado-red-gas'},
            timeout=30,
        )
        r.raise_for_status()
    except Exception as e:
        print(f"ERROR fetching SMN: {e}", file=sys.stderr)
        alerts_path = os.path.join(OUT_DIR, 'smn_alerts.json')
        write_json(alerts_path, [], source='SMN alertas (fetch failed)', error=str(e))
        write_csv(json_to_csv_path(alerts_path), [], fieldnames=ALERTS_CSV_COLS)
        return

    if r.content[:2] != b'PK':
        print(f"SMN response is not a ZIP (first bytes {r.content[:10]!r})", file=sys.stderr)
        alerts_path = os.path.join(OUT_DIR, 'smn_alerts.json')
        write_json(alerts_path, [], source='SMN alertas (unexpected response)')
        write_csv(json_to_csv_path(alerts_path), [], fieldnames=ALERTS_CSV_COLS)
        return

    try:
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            names = z.namelist()
            if not names:
                text = ''
            else:
                with z.open(names[0]) as fh:
                    text = fh.read().decode('latin-1', errors='replace')
    except Exception as e:
        print(f"ERROR unzipping SMN: {e}", file=sys.stderr)
        alerts_path = os.path.join(OUT_DIR, 'smn_alerts.json')
        write_json(alerts_path, [], source='SMN alertas (zip error)', error=str(e))
        write_csv(json_to_csv_path(alerts_path), [], fieldnames=ALERTS_CSV_COLS)
        return

    alerts = parse_alerts_text(text)
    alerts_path = os.path.join(OUT_DIR, 'smn_alerts.json')
    write_json(
        alerts_path,
        alerts,
        source='SMN Open Data — alertas meteorológicas',
    )
    # Drop the 'raw' field from CSV — it duplicates the parsed columns.
    write_csv(json_to_csv_path(alerts_path), alerts, fieldnames=ALERTS_CSV_COLS)
    print(f"smn_alerts.json: {len(alerts)} active alerts")


if __name__ == '__main__':
    main()
