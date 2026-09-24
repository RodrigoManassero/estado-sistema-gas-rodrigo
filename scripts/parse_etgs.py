#!/usr/bin/env python3
"""Parse the daily ETGS PDF (TGS "Síntesis del Estado Operativo").

TGS sends this PDF every morning to all transport shippers. It's the only
direct line into TGS-specific operational state we have:
    - Linepack TGS in absolute MMm³ (stock, not delta) — the value the public
      ENARGAS PDFs only show as a system total.
    - Operational estado + motivo (e.g. "Por bajo linepack del sistema").
    - Poder calorífico (Kcal) per gasoducto and cámara.

The PDF arrives via the email-ingest pipeline (fetch_inbox.py drops to
raw/incoming/ → ingest_incoming.py routes ETGS*.pdf to raw/), so the parser
just walks raw/ETGS*.pdf and upserts by `fecha`.

Format is short and stable — single page, ~900 chars of text, label-anchored
regex extraction works without needing pdfplumber positions.
"""

import glob
import json
import os
import re
import sys
from datetime import datetime

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
ETGS_JSON = os.path.join(OUT_DIR, 'etgs.json')

ETGS_CSV_COLS = [
    'fecha', 'source', 'generado_at',
    'linepack_tgs_dia_anterior', 'linepack_tgs_dia_actual', 'linepack_tgs_variacion',
    'estado', 'motivo',
    'pcs_san_martin', 'pcs_neuba_1', 'pcs_neuba_2',
    'pcs_troncal', 'pcs_paralelo',
]


def _num(s):
    """Parse 'es-AR' number — '24,378' -> 24.378, '208.16' -> 208.16."""
    if s is None:
        return None
    s = str(s).strip()
    if not s or s == '-':
        return None
    if s.count(',') == 1 and '.' not in s:
        s = s.replace(',', '.')
    else:
        s = s.replace(',', '')
    try:
        return float(s)
    except ValueError:
        return None


def _kcal(s):
    """Parse PCS (Kcal) — comma is thousands separator, not decimal."""
    if s is None:
        return None
    s = str(s).strip().replace(',', '').replace('.', '')
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def extract_etgs(text: str) -> dict:
    """Extract all known fields from the ETGS PDF text."""
    d: dict = {}

    # "Generado el 30/04/2026 08.34.52"
    m = re.search(r'Generado el\s*(\d{2})/(\d{2})/(\d{4})\s+(\d{2})[.:](\d{2})[.:](\d{2})', text)
    if m:
        dd, mm, yy, hh, mn, ss = m.groups()
        d['generado_at'] = f'{yy}-{mm}-{dd}T{hh}:{mn}:{ss}'

    # "Datos del día operativo 29/04/2026"
    m = re.search(r'(?:D[ií]a\s*operativo|d[ií]a operativo)\s*(\d{2})/(\d{2})/(\d{4})', text)
    if m:
        dd, mm, yy = m.groups()
        d['fecha'] = f'{yy}-{mm}-{dd}'

    # "Día Anterior 208.16 Día Actual 204.96 Variación -3.20"
    m = re.search(
        r'D[ií]a\s*Anterior\s+([\d.,-]+)\s+D[ií]a\s*Actual\s+([\d.,-]+)\s+Variaci[oó]n\s+([\d.,-]+)',
        text,
    )
    if m:
        d['linepack_tgs_dia_anterior'] = _num(m.group(1))
        d['linepack_tgs_dia_actual'] = _num(m.group(2))
        d['linepack_tgs_variacion'] = _num(m.group(3))

    # ---------------------------------------------------------------------
    # Extracción de ESTADO y MOTIVO
    # ---------------------------------------------------------------------
    # 1. Extracción del ESTADO
    m_estado = re.search(r'Estado\s*\n?\s*(Normal|Alerta|Cr[ií]tico|Emergencia)', text, re.IGNORECASE)
    if m_estado:
        estado_raw = m_estado.group(1).capitalize()
        # Normalizar acento
        d['estado'] = 'Crítico' if estado_raw.lower() in ['critico', 'crítico'] else estado_raw
    else:
        # Fallback por si la palabra "Estado" no figura explícitamente pero hay alerta
        if re.search(r'Alerta', text, re.IGNORECASE):
            d['estado'] = 'Alerta'
        else:
            d['estado'] = 'Normal'

    # 2. Extracción del MOTIVO
    m_motivo = re.search(r'Motivo\s*\n?\s*([^\n]+)', text)
    if m_motivo:
        raw_m = m_motivo.group(1).strip()
        # Si el motivo dice "Normal" o está vacío, asignamos None
        if raw_m.lower() in ['normal', '-', ''] or d['estado'] == 'Normal':
            d['motivo'] = None
        else:
            # Limpia prefijos repetidos o basuras como "TGS - Alerta " del texto del motivo
            clean_m = re.sub(r'^(?:TGSA?|TGS)\s*-\s*', '', raw_m, flags=re.IGNORECASE)
            clean_m = re.sub(r'^Alerta\s*', '', clean_m, flags=re.IGNORECASE).strip()
            d['motivo'] = clean_m if clean_m else None
    else:
        d['motivo'] = None

    # Poder calorífico
    pcs_patterns = [
        ('pcs_san_martin', r'Gasoducto\s*San\s*Mart[ií]n\s+([\d.,]+)'),
        ('pcs_neuba_1', r'Gasoducto\s*Neuba\s*I\s+([\d.,]+)'),
        ('pcs_neuba_2', r'Gasoducto\s*Neuba\s*II\s+([\d.,]+)'),
        ('pcs_troncal', r'Gasoducto\s*Troncal\s+([\d.,]+)'),
        ('pcs_paralelo', r'Gasoducto\s*Paralelo\s+([\d.,]+)'),
    ]
    for key, pat in pcs_patterns:
        m = re.search(pat, text)
        if m:
            d[key] = _kcal(m.group(1))

    return d


def parse_etgs_pdf(path: str) -> dict:
    with pdfplumber.open(path) as pdf:
        text = '\n'.join((p.extract_text() or '') for p in pdf.pages)
    row = extract_etgs(text)
    row['source'] = os.path.basename(path)
    return row


def load_existing() -> dict:
    if not os.path.exists(ETGS_JSON):
        return {}
    with open(ETGS_JSON, encoding='utf-8') as f:
        raw = json.load(f)
    data = raw.get('data', raw) if isinstance(raw, dict) else raw
    
    # Migración/normalización para mantener retrocompatibilidad con keys viejas en cache
    cleaned_rows = {}
    for r in (data or []):
        if not r.get('fecha'):
            continue
        # Mapea keys viejas a las nuevas si existen
        if 'alerta_estado' in r and 'estado' not in r:
            old_est = r.pop('alerta_estado', 'Normal')
            r['estado'] = 'Alerta' if 'alerta' in str(old_est).lower() else 'Normal'
        if 'alerta_motivo' in r and 'motivo' not in r:
            old_mot = r.pop('alerta_motivo', None)
            r['motivo'] = None if str(old_mot).lower() == 'normal' else old_mot
            
        cleaned_rows[r['fecha']] = r
        
    return cleaned_rows


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    pdfs = sorted(glob.glob(os.path.join(RAW_DIR, 'ETGS*.pdf')))
    by_date = load_existing()
    print(f'Loaded {len(by_date)} existing rows; processing {len(pdfs)} ETGS PDFs from raw/')

    issues: list[str] = []
    for path in pdfs:
        try:
            with open(path, 'rb') as fh:
                if fh.read(5) != b'%PDF-':
                    issues.append(f'{os.path.basename(path)}: not a valid PDF (skipped)')
                    continue
            row = parse_etgs_pdf(path)
            if not row.get('fecha'):
                issues.append(f'{os.path.basename(path)}: no fecha extracted')
                continue
            by_date[row['fecha']] = row
            print(f"Parsed {os.path.basename(path)}: fecha={row['fecha']} Estado={row.get('estado')} Motivo={row.get('motivo')} LP_TGS={row.get('linepack_tgs_dia_actual')}")
        except Exception as e:
            issues.append(f'{os.path.basename(path)}: exception {e}')
            print(f'Error parsing {path}: {e}', file=sys.stderr)

    rows = sorted(by_date.values(), key=lambda r: r.get('fecha') or '')
    if issues:
        print('WARN: ETGS parse issues:', file=sys.stderr)
        for msg in issues:
            print(f'  {msg}', file=sys.stderr)

    latest = max((r.get('fecha') for r in rows if r.get('fecha')), default=None)
    write_json(
        ETGS_JSON,
        rows,
        source='TGS — Síntesis del Estado Operativo (ETGS)',
        source_date=latest,
        issues=issues,
    )
    write_csv(json_to_csv_path(ETGS_JSON), rows, fieldnames=ETGS_CSV_COLS)
    print(f'etgs.json: {len(rows)} rows updated successfully')


if __name__ == '__main__':
    main()
