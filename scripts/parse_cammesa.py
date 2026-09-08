#!/usr/bin/env python3
"""Parse CAMMESA weekly dispatch outlook PDF.

Extracts the two-week 'Balance Semanal' table from page 7 of
PrevisionDespachoEnergetico_*.pdf — GWh + MWmed by source (demanda,
exportación, térmico, hidráulico, nuclear, renovable, importación)
plus fuel forecasts (gas, FO, GO, carbón).

The PDF uses rotated labels and a layout pdfplumber decodes with
mangled accents ('T�rmico'), so this parser identifies rows by
position within the extracted table rather than by label match.
"""

import glob
import os
import re
import sys
from datetime import datetime

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')

# Order of the energy-source rows on page 7. Each row reports GWh + MWmed.
ENERGY_FIELDS = [
    'demanda', 'exportacion', 'termico', 'hidraulico',
    'nuclear', 'renovable', 'importacion',
]
# Then four fuel rows. Each reports a single weekly figure.
FUEL_FIELDS = ['gas_mm3_dia', 'fo_miles_ton', 'go_miles_m3', 'carbon_miles_ton']


def parse_number(s):
    """CAMMESA prints integers without thousand separators (e.g. '2967')
    and decimals with either '.' or ',' (e.g. '35.0', '700,08'). Treat
    both as decimal separators."""
    if s is None:
        return None
    cleaned = str(s).strip().replace(',', '.')
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_report_date(page1_text):
    """Extract the report date from page 1's footer 'DD/MM/YY' stamp."""
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', page1_text or '')
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    try:
        return f"{y:04d}-{mo:02d}-{d:02d}"
    except ValueError:
        return None


def parse_date_range(s):
    """'11/5/2026 - 17/5/2026' -> ('2026-05-11', '2026-05-17')."""
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})\s*-\s*(\d{1,2})/(\d{1,2})/(\d{4})', s or '')
    if not m:
        return None, None
    sd = f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    ed = f"{int(m.group(6)):04d}-{int(m.group(5)):02d}-{int(m.group(4)):02d}"
    return sd, ed


# Each label is matched as a case-sensitive prefix against the line —
# accents come back mangled from pdfplumber so we anchor on ASCII-safe
# substrings. Order mirrors how the rows appear on the PDF page.
ENERGY_LABELS = [
    ('demanda', 'Demanda'),
    ('exportacion', 'Exportaci'),
    ('termico', 'rmico'),       # "Térmico" / "T�rmico"
    ('hidraulico', 'ulico'),    # "Hidráulico" / "Hidr�ulico"
    ('nuclear', 'Nuclear'),
    ('renovable', 'Renovable'),
    ('importacion', 'Importaci'),
]
FUEL_LABELS = [
    ('gas_mm3_dia', 'Gas '),
    ('fo_miles_ton', 'FO '),
    ('go_miles_m3', 'GO '),
    ('carbon_miles_ton', 'Carb'),
]

NUMBER_RE = re.compile(r'-?\d+(?:[.,]\d+)?')


def extract_numbers(line, drop_leading=0):
    """Return every numeric token in *line* (after skipping the first
    *drop_leading* tokens, which may be embedded in a unit string)."""
    return [parse_number(m.group(0)) for m in NUMBER_RE.finditer(line)][drop_leading:]


def find_line(lines, needle):
    for line in lines:
        if needle in line:
            return line
    return None


def parse_week_block(text):
    """Page-7 layout (text mode): the same line that holds 'Demanda'
    holds four numbers — gwh+mwmed for week N then gwh+mwmed for week
    N+1. Fuel rows put two single values (one per week) at the end.
    """
    lines = (text or '').split('\n')

    # Week numbers: "Semana 20 Semana 21" or "Semana 20\nSemana 21".
    nums = []
    for line in lines:
        for m in re.finditer(r'Semana\s+(\d{1,2})', line):
            nums.append(m.group(1))
            if len(nums) == 2:
                break
        if len(nums) == 2:
            break

    # Date ranges on the next informative line.
    ranges = []
    for line in lines:
        for m in re.finditer(
            r'(\d{1,2})/(\d{1,2})/(\d{4})\s*-\s*(\d{1,2})/(\d{1,2})/(\d{4})',
            line,
        ):
            sd = f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
            ed = f"{int(m.group(6)):04d}-{int(m.group(5)):02d}-{int(m.group(4)):02d}"
            ranges.append((sd, ed))
            if len(ranges) == 2:
                break
        if len(ranges) == 2:
            break

    if len(nums) < 2 or len(ranges) < 2:
        return []

    week1 = {
        'week_num': nums[0], 'start_date': ranges[0][0], 'end_date': ranges[0][1],
    }
    week2 = {
        'week_num': nums[1], 'start_date': ranges[1][0], 'end_date': ranges[1][1],
    }

    # Energy rows: expect 4 numbers (gwh1, mw1, gwh2, mw2).
    for key, needle in ENERGY_LABELS:
        line = find_line(lines, needle)
        nums_in_line = extract_numbers(line) if line else []
        if len(nums_in_line) >= 4:
            g1, m1, g2, m2 = nums_in_line[:4]
        else:
            g1 = m1 = g2 = m2 = None
        week1[f'{key}_gwh'] = g1
        week1[f'{key}_mwmed'] = m1
        week2[f'{key}_gwh'] = g2
        week2[f'{key}_mwmed'] = m2

    # Fuel rows: 'Gas Mm3/día 31.0 35.0' — the unit string contains
    # the digit '3' which we have to ignore; take the LAST two numbers.
    for key, needle in FUEL_LABELS:
        line = find_line(lines, needle)
        nums_in_line = extract_numbers(line) if line else []
        if len(nums_in_line) >= 2:
            v1, v2 = nums_in_line[-2], nums_in_line[-1]
        else:
            v1 = v2 = None
        week1[key] = v1
        week2[key] = v2

    return [week1, week2]


def parse_cammesa_pdf(path):
    """Open the PDF and find the page that looks like the weekly
    outlook (contains 'Semana' and 'Gwh' and 'Demanda'). Extract
    everything from the page's plain text — table extraction is too
    sensitive to layout drift."""
    with pdfplumber.open(path) as pdf:
        page1_text = pdf.pages[0].extract_text() or ''
        target_text = ''
        # CAMMESA puts it on page 7 in current layouts; scan the whole
        # PDF as a safety net.
        for page in pdf.pages:
            text = page.extract_text() or ''
            if 'Semana' in text and ('Gwh' in text or 'GWh' in text) and 'Demanda' in text:
                target_text = text
                break

    weeks = parse_week_block(target_text)
    return {
        'report_date': parse_report_date(page1_text),
        'report_filename': os.path.basename(path),
        'weeks': weeks,
    }


def latest_pdf():
    """Pick the most recently dated PrevisionDespachoEnergetico_*.pdf
    in raw/. Sort by filename — the YYYYMMDD timestamp embedded by
    fetch_cammesa.py makes lexical order match chronological."""
    pdfs = sorted(glob.glob(os.path.join(RAW_DIR, 'PrevisionDespachoEnergetico_*.pdf')))
    return pdfs[-1] if pdfs else None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    pdf = latest_pdf()
    if not pdf:
        print("No PrevisionDespachoEnergetico_*.pdf found in raw/")
        return

    try:
        with open(pdf, 'rb') as fh:
            if fh.read(5) != b'%PDF-':
                print(f"{os.path.basename(pdf)}: not a valid PDF", file=sys.stderr)
                return
        payload = parse_cammesa_pdf(pdf)
    except Exception as e:
        print(f"Error parsing {pdf}: {e}", file=sys.stderr)
        return

    if not payload['weeks']:
        print(f"WARN: no weekly rows extracted from {os.path.basename(pdf)}", file=sys.stderr)

    out_path = os.path.join(OUT_DIR, 'cammesa_weekly.json')
    write_json(out_path, payload, source='CAMMESA — Previsión Despacho Energético')

    # CSV: one row per week with every field flattened, for the audit
    # download on the Fuentes page.
    flat = []
    for w in payload['weeks']:
        row = {'report_date': payload['report_date']}
        row.update(w)
        flat.append(row)
    write_csv(json_to_csv_path(out_path), flat)
    print(f"cammesa_weekly.json: {len(payload['weeks'])} weeks (report {payload['report_date']})")


if __name__ == '__main__':
    main()
