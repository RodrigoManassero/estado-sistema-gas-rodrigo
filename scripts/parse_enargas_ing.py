#!/usr/bin/env python3
"""Parse ENARGAS Inyección Nacional por Gasoducto (ING_YYYYMMDD.pdf) into JSON.

The ING is a daily PDF from the ENARGAS Power BI dashboard (cat=6) that shows
13 days of national gas injection broken out by gasoducto:
    - San Martín, Neuba I, Neuba II, GPFM (Perito Moreno) — operated by TGS
    - Centro Oeste, Norte — operated by TGN

Each report covers ~8 past days (real, marked R) plus ~5 future days
(programado, marked P). Subsequent reports refine prior values, so the parser
upserts by `fecha` and the latest report wins.

Norte is not labelled with a numeric text value in the PDF (its values are
small enough — Bolivia imports near zero — that the bar gets no label). We
derive it as `total - sum(other gasoductos)` from the labelled total.

Algorithm: extract words with their (x, y) coordinates, identify the date row
at the bottom, cluster numeric labels by Y into 6 horizontal bands (top→down:
total, centro_oeste, gpfm, neuba_2, neuba_1, san_martin), then match each
value to its date column by X position.
"""

import glob
import json
import os
import re
import sys

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
ING_JSON = os.path.join(OUT_DIR, 'enargas_ing.json')

DATE_RE = re.compile(r'^(\d{1,2})/(\d{1,2})/(\d{2})$')

# Stack order top→down in the PDF chart. The legend is
# "San Martín | Neuba I | Neuba II | GPFM | Centro Oeste | Norte" (left→right),
# but the area chart stacks them with San Martín at the bottom and the total
# label on top, so band 0 (smallest Y) is the total label.
SERIES_TOP_DOWN = ['total', 'centro_oeste', 'gpfm', 'neuba_2', 'neuba_1', 'san_martin']

ING_CSV_COLS = [
    'fecha', 'tipo', 'source',
    'san_martin', 'neuba_1', 'neuba_2', 'gpfm', 'centro_oeste', 'norte',
    'total', 'tgs', 'tgn',
]


def _parse_decimal(text):
    """'24,7' -> 24.7; '120' (axis label) -> None to filter out integers."""
    if ',' not in text and '.' not in text:
        return None
    try:
        return float(text.replace(',', '.'))
    except ValueError:
        return None


def extract_ing(pdf_path):
    """Extract one row per fecha from a single ING PDF.

    Returns a list of dicts (13 entries on a normal report).
    """
    with pdfplumber.open(pdf_path) as pdf:
        words = pdf.pages[0].extract_words(use_text_flow=False)

    # Anchor: the date row near the bottom (e.g. 16/4/26, 17/4/26, ...).
    date_words = []
    for w in words:
        m = DATE_RE.match(w['text'])
        if not m:
            continue
        d, mo, y = m.groups()
        date_words.append({
            'iso': f"20{y}-{int(mo):02d}-{int(d):02d}",
            'x': w['x0'],
            'y': w['top'],
        })
    if not date_words:
        return []
    date_words.sort(key=lambda d: d['x'])
    dates_y = date_words[0]['y']
    date_cols = [d['x'] for d in date_words]

    # R/P row sits ~14 px above the date row.
    rp = {}
    for w in words:
        if abs(w['top'] - (dates_y - 14)) < 6 and w['text'] in ('R', 'P'):
            i = min(range(len(date_cols)), key=lambda j: abs(date_cols[j] - w['x0']))
            rp[date_words[i]['iso']] = w['text']

    # Numeric labels above the date row, excluding the y-axis labels at x<60.
    values = []
    for w in words:
        if w['top'] >= dates_y - 5:
            continue
        if w['x0'] < 60:
            continue
        v = _parse_decimal(w['text'])
        if v is None:
            continue
        values.append({'x': w['x0'], 'y': w['top'], 'v': v})

    # Match each value to its closest date column (within ~15 px).
    matched = []
    for v in values:
        diffs = [abs(c - v['x']) for c in date_cols]
        i = min(range(len(diffs)), key=lambda j: diffs[j])
        if diffs[i] >= 15:
            continue
        v['iso'] = date_words[i]['iso']
        matched.append(v)

    if not matched:
        return []

    # For each date column, sort the matched values by Y and assign them to
    # series in stack order top→down: total, centro_oeste, gpfm, neuba_2,
    # neuba_1, san_martin. This is more robust than Y-banding across columns
    # because Power BI labels different series at different vertical positions
    # depending on their stacked segment height — so bands overlap on dense
    # PDFs (15-16 day reports), but per-column the order is consistent.
    series = {name: {} for name in SERIES_TOP_DOWN}
    by_col = {}
    for v in matched:
        by_col.setdefault(v['iso'], []).append(v)
    for iso, vals in by_col.items():
        vals.sort(key=lambda m: m['y'])
        for i, v in enumerate(vals[:len(SERIES_TOP_DOWN)]):
            name = SERIES_TOP_DOWN[i]
            series[name][iso] = round(v['v'], 2)

    rows = []
    source = os.path.basename(pdf_path)
    for dw in date_words:
        iso = dw['iso']
        row = {
            'fecha': iso,
            'tipo': rp.get(iso),
            'san_martin': series['san_martin'].get(iso),
            'neuba_1': series['neuba_1'].get(iso),
            'neuba_2': series['neuba_2'].get(iso),
            'gpfm': series['gpfm'].get(iso),
            'centro_oeste': series['centro_oeste'].get(iso),
            'total': series['total'].get(iso),
            'source': source,
        }
        # Norte = total - sum(other gasoductos). Floor at 0 — when Bolivia
        # imports are nil, rounding can push it slightly negative.
        others = [row[k] for k in ('san_martin', 'neuba_1', 'neuba_2', 'gpfm', 'centro_oeste')]
        if row['total'] is not None and all(v is not None for v in others):
            norte = round(row['total'] - sum(others), 2)
            row['norte'] = max(norte, 0.0)
        else:
            row['norte'] = None
        # Aggregations by transportista.
        tgs_parts = [row[k] for k in ('san_martin', 'neuba_1', 'neuba_2', 'gpfm')]
        if all(v is not None for v in tgs_parts):
            row['tgs'] = round(sum(tgs_parts), 2)
        else:
            row['tgs'] = None
        if row['centro_oeste'] is not None and row['norte'] is not None:
            row['tgn'] = round(row['centro_oeste'] + row['norte'], 2)
        else:
            row['tgn'] = None
        rows.append(row)
    return rows


def load_existing():
    if not os.path.exists(ING_JSON):
        return {}
    with open(ING_JSON, encoding='utf-8') as f:
        raw = json.load(f)
    data = raw.get('data', raw) if isinstance(raw, dict) else raw
    return {r['fecha']: r for r in (data or []) if r.get('fecha')}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    pdfs = sorted(glob.glob(os.path.join(RAW_DIR, 'ING_*.pdf')))
    by_date = load_existing()
    print(f"Loaded {len(by_date)} existing rows; processing {len(pdfs)} ING PDFs from raw/")

    issues = []
    for path in pdfs:
        try:
            with open(path, 'rb') as fh:
                if fh.read(5) != b'%PDF-':
                    issues.append(f"{os.path.basename(path)}: not a valid PDF (skipped)")
                    continue
            rows = extract_ing(path)
            if not rows:
                issues.append(f"{os.path.basename(path)}: no rows extracted")
                continue
            for r in rows:
                if r.get('fecha'):
                    # Latest PDF wins (sorted ascending — last write).
                    by_date[r['fecha']] = r
            print(f"Parsed {os.path.basename(path)}: {len(rows)} rows")
        except Exception as e:
            issues.append(f"{os.path.basename(path)}: exception {e}")
            print(f"Error parsing {path}: {e}", file=sys.stderr)

    rows = sorted(by_date.values(), key=lambda r: r.get('fecha') or '')
    if issues:
        print("WARN: ING parse issues:", file=sys.stderr)
        for msg in issues:
            print(f"  {msg}", file=sys.stderr)

    latest = max((r.get('fecha') for r in rows if r.get('fecha')), default=None)
    write_json(
        ING_JSON,
        rows,
        source='ENARGAS Inyección Nacional por Gasoducto (ING)',
        source_date=latest,
        issues=issues,
    )
    write_csv(json_to_csv_path(ING_JSON), rows, fieldnames=ING_CSV_COLS)
    print(f"enargas_ing.json: {len(rows)} rows")


if __name__ == '__main__':
    main()
