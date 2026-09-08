#!/usr/bin/env python3
"""Fetch CAMMESA Parte Post Operativo (PPO) — daily fuel mix + generation.

The PPO is published daily via the public API at api.cammesa.com/pub-svc/public.
Each file is an OLE2 .xls "protected" with the Microsoft default read-only
password VelvetSweatshop (no real authentication — Excel opens these files
without prompting). We decrypt, aggregate the "Consumo Combustibles" sheet
across every plant, and write a daily time series into cammesa_ppo.json.

Units:
- Gas natural: dam³ (1 dam³ = 1000 m³, so divide by 1000 to get MMm³/d)
- Carbón mineral: Tn
- Fuel Oil: Tn
- Gas Oil: m³
- Generación neta: MWh

Usage:
    python scripts/fetch_cammesa_ppo.py --days 30
    python scripts/fetch_cammesa_ppo.py --days 365 --force
"""

import argparse
import io
import json
import os
import sys
from datetime import date, datetime, timedelta

import requests

try:
    import msoffcrypto
    import xlrd
except ImportError as e:
    print(f"Install dependencies first: pip install msoffcrypto-tool xlrd  ({e})", file=sys.stderr)
    sys.exit(1)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
CAMMESA_JSON = os.path.join(OUT_DIR, 'cammesa_ppo.json')

API_BASE = 'https://api.cammesa.com/pub-svc/public/'
NEMO = 'INFORME_OPERATIVO'
DEFAULT_PW = 'VelvetSweatshop'  # Excel's default read-only password
HDRS = {'User-Agent': 'Mozilla/5.0 Chrome/130 estado-red-gas'}


def load_existing():
    if not os.path.exists(CAMMESA_JSON):
        return {}
    with open(CAMMESA_JSON, encoding='utf-8') as f:
        raw = json.load(f)
    data = raw.get('data', raw) if isinstance(raw, dict) else raw
    return {r['fecha']: r for r in (data or []) if r.get('fecha')}


def list_documents(date_from: date, date_to: date, session: requests.Session):
    """Query findDocumentosByNemoRango. Returns list of doc dicts with attachments."""
    params = {
        'nemo': NEMO,
        'fechadesde': f'{date_from.isoformat()}T00:00:00',
        'fechahasta': f'{date_to.isoformat()}T23:59:59',
    }
    r = session.get(API_BASE + 'findDocumentosByNemoRango', params=params, headers=HDRS, timeout=60)
    r.raise_for_status()
    return r.json()


def download_and_decrypt(doc_id: str, attachment_id: str, session: requests.Session) -> bytes:
    r = session.get(API_BASE + 'findAttachmentByNemoId', params={
        'attachmentId': attachment_id,
        'docId': doc_id,
        'nemo': NEMO,
    }, headers=HDRS, timeout=120)
    r.raise_for_status()
    if not r.content or r.content[:4] != b'\xd0\xcf\x11\xe0':
        raise ValueError(f'not an OLE2 file (first bytes {r.content[:8]!r})')
    office = msoffcrypto.OfficeFile(io.BytesIO(r.content))
    try:
        office.load_key(password=DEFAULT_PW)
    except Exception as e:
        raise ValueError(f'decrypt failed: {e}')
    out = io.BytesIO()
    office.decrypt(out)
    out.seek(0)
    return out.read()


def aggregate_fuel_sheet(xls_bytes: bytes):
    """Sum every plant row in Consumo Combustibles, return totals + metadata."""
    wb = xlrd.open_workbook(file_contents=xls_bytes, on_demand=True)
    if 'Consumo Combustibles' not in wb.sheet_names():
        return None
    s = wb.sheet_by_name('Consumo Combustibles')

    # Parse "Día: 01/04/2026" from row 1 (col 5 in the samples we inspected).
    fecha_iso = None
    for r in range(3):
        for c in range(s.ncols):
            v = s.cell_value(r, c)
            if isinstance(v, str) and 'Día' in v:
                try:
                    fecha_iso = datetime.strptime(v.split(':', 1)[1].strip(), '%d/%m/%Y').date().isoformat()
                except ValueError:
                    pass
                break
        if fecha_iso:
            break

    # Columns per fuel group, based on the inspected header:
    #  B(1)     C(2)=consumo gas   D(3)=e.gen gas    E(4)=pot gas
    #  F(5)=consumo carbón         G(6)=e.gen carbón  H(7)=pot carbón
    #  I(8)=consumo fueloil        J(9)=e.gen fueloil K(10)=pot fueloil
    #  L(11)=consumo gasoil        M(12)=e.gen gasoil N(13)=pot gasoil
    # Data rows start at 4; they continue until an empty plant code or summary.
    totals = {
        'gas_dam3': 0.0,
        'carbon_tn': 0.0,
        'fueloil_tn': 0.0,
        'gasoil_m3': 0.0,
        'gen_gas_mwh': 0.0,
        'gen_carbon_mwh': 0.0,
        'gen_fueloil_mwh': 0.0,
        'gen_gasoil_mwh': 0.0,
    }
    plants_counted = 0
    for r in range(4, s.nrows):
        code = str(s.cell_value(r, 1) or '').strip()
        if not code or code.lower().startswith('total'):
            continue
        def num(col):
            v = s.cell_value(r, col)
            try:
                return float(v or 0)
            except (TypeError, ValueError):
                return 0.0
        totals['gas_dam3'] += num(2)
        totals['gen_gas_mwh'] += num(3)
        totals['carbon_tn'] += num(5)
        totals['gen_carbon_mwh'] += num(6)
        totals['fueloil_tn'] += num(8)
        totals['gen_fueloil_mwh'] += num(9)
        totals['gasoil_m3'] += num(11)
        totals['gen_gasoil_mwh'] += num(12)
        plants_counted += 1

    return {
        'fecha': fecha_iso,
        'gas_mmm3': round(totals['gas_dam3'] / 1000, 3),  # dam³ -> MMm³
        'carbon_tn': round(totals['carbon_tn'], 1),
        'fueloil_tn': round(totals['fueloil_tn'], 1),
        'gasoil_m3': round(totals['gasoil_m3'], 1),
        'gen_gas_mwh': round(totals['gen_gas_mwh'], 1),
        'gen_carbon_mwh': round(totals['gen_carbon_mwh'], 1),
        'gen_fueloil_mwh': round(totals['gen_fueloil_mwh'], 1),
        'gen_gasoil_mwh': round(totals['gen_gasoil_mwh'], 1),
        'plants_counted': plants_counted,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--days', type=int, default=30, help='days back from today')
    parser.add_argument('--force', action='store_true', help='re-fetch dates we already have')
    parser.add_argument('--sleep-ms', type=int, default=150)
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    existing = load_existing()
    print(f"Starting with {len(existing)} existing rows in cammesa_ppo.json")

    today = date.today()
    date_from = today - timedelta(days=args.days)

    session = requests.Session()
    print(f"Listing PPO documents {date_from} to {today}...")
    try:
        docs = list_documents(date_from, today, session)
    except Exception as e:
        print(f"ERROR listing: {e}", file=sys.stderr)
        return 1

    print(f"  {len(docs)} documents found")

    added = 0
    failures = []
    for doc in docs:
        # fecha comes as "DD/MM/YYYY" — reparse to ISO
        try:
            fecha_iso = datetime.strptime(doc['fecha'], '%d/%m/%Y').date().isoformat()
        except (KeyError, ValueError):
            failures.append(f"bad fecha in doc {doc.get('id')}")
            continue

        if fecha_iso in existing and not args.force:
            continue

        attachments = doc.get('adjuntos') or []
        if not attachments:
            failures.append(f"{fecha_iso}: no attachments")
            continue
        att = attachments[0]
        attachment_id = att.get('id') or att.get('nombre')
        if not attachment_id:
            failures.append(f"{fecha_iso}: missing attachment id")
            continue

        try:
            xls = download_and_decrypt(doc['id'], attachment_id, session)
            aggregated = aggregate_fuel_sheet(xls)
        except Exception as e:
            failures.append(f"{fecha_iso}: {e}")
            print(f"  FAIL {fecha_iso}: {e}", file=sys.stderr)
            continue

        if not aggregated:
            failures.append(f"{fecha_iso}: no Consumo Combustibles sheet")
            continue
        # Prefer the date from the sheet header if parsable, else fall back to doc date.
        aggregated['fecha'] = aggregated.get('fecha') or fecha_iso
        aggregated['source'] = attachment_id
        existing[aggregated['fecha']] = aggregated
        added += 1
        if added % 5 == 0:
            print(f"  +{added} gas={aggregated['gas_mmm3']} MMm³ gen_gas={aggregated['gen_gas_mwh']} MWh")
        if args.sleep_ms:
            import time as _t
            _t.sleep(args.sleep_ms / 1000)

    rows = sorted(existing.values(), key=lambda r: r.get('fecha') or '')
    latest = rows[-1]['fecha'] if rows else None
    write_json(
        CAMMESA_JSON,
        rows,
        source='CAMMESA PPO — Consumo Combustibles (aggregated per day)',
        source_date=latest,
        failures=failures[-30:],
    )
    ppo_cols = [
        'fecha', 'source', 'gas_mmm3', 'carbon_tn', 'fueloil_tn', 'gasoil_m3',
        'gen_gas_mwh', 'gen_carbon_mwh', 'gen_fueloil_mwh', 'gen_gasoil_mwh',
        'plants_counted',
    ]
    write_csv(json_to_csv_path(CAMMESA_JSON), rows, fieldnames=ppo_cols)
    print(f"\ncammesa_ppo.json: {len(rows)} rows ({added} new, {len(failures)} failed)")
    return 0


if __name__ == '__main__':
    sys.exit(main())
