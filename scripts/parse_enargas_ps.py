#!/usr/bin/env python3
"""Parse ENARGAS 'Proyección Semanal' (PS_YYYYMMDD.pdf) into JSON.

ENARGAS publishes a weekly transport-system demand projection ("Proyección
Semanal de Demanda según datos provistos por Licenciatarias") at
.../dod-proyeccion-semanal.php, served through
`descarga.php?path=proyeccion-semanal&file=PS_YYYYMMDD.pdf`.

It's a single-page PDF with one table, "OPERACIÓN GASODUCTOS TGN + TGS". The
columns are:  [día1 proyección] [REAL] [día del reporte] [día+1] [día+2] ...
The **REAL** column carries the *actual* figures for día1 (the day before the
report); the rest are the daily projection for the week.

This source is the only automatic feed that carries the operational fields the
manual Excel used to own:
  - linepack TGN / TGS / total del sistema + límites (Min/Max)
  - tramos iniciales / finales
  - inyección por gasoducto (Sur, Neuba I/II, Norte, Neuquén) incl. ENARSA/GPFM,
    Buque Escobar, Bolivia
  - demanda por segmento + temperatura BA estimada

We extract the REAL row (the D-1 actuals) from each report; over a backfill the
REAL rows form a dense daily actual series. Output is upserted by fecha into
enargas_ps.json so historical backfills survive a nightly run with few PDFs in
raw/ (same merge discipline as parse_enargas.py).

The CAMMESA report templates drift the table's column x-positions between
reports, so column anchors are read from each PDF's own header row rather than
hard-coded.
"""

import io
import os
import re
import sys
import glob
import unicodedata
from collections import defaultdict
from datetime import date, timedelta

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
PS_JSON = os.path.join(OUT_DIR, 'enargas_ps.json')

MONTHS = {
    'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'sep': 9, 'set': 9, 'oct': 10, 'nov': 11, 'dic': 12,
}

NUM_RE = re.compile(r'^-?\d+(?:[.,]\d+)?$')
LIM_RE = re.compile(r'(?:MIN|Min):\s*(-?\d+)\s*-\s*(?:MAX|Max):\s*(-?\d+)')

# field -> (lim_inf key, lim_sup key) for rows that publish a Min/Max band
LIMIT_KEYS = {
    'linepack_total': ('lim_inf_total', 'lim_sup_total'),
    'linepack_tgs': ('lim_inf_tgs', 'lim_sup_tgs'),
    'linepack_tgn': ('lim_inf_tgn', 'lim_sup_tgn'),
    'tramo_inicial': ('lim_inf_tramo_inicial', 'lim_sup_tramo_inicial'),
    'tramo_final': ('lim_inf_tramo_final', 'lim_sup_tramo_final'),
}

# stable output column order for the CSV / row shape
PS_FIELDS = [
    'fecha', 'tipo', 'source',
    'temp_prom_ba', 'demanda_total',
    'prioritaria', 'combustible', 'gnc', 'industria', 'usinas',
    'exp_tgn', 'exp_tgs',
    'iny_total', 'iny_tgs', 'iny_sur', 'iny_neuba1', 'iny_neuba2', 'iny_patagonico',
    'iny_tgn', 'iny_norte', 'iny_neuquen',
    'iny_enarsa', 'iny_gpm', 'iny_bolivia', 'iny_chile', 'peak_shaving', 'iny_escobar',
    'linepack_total', 'lim_inf_total', 'lim_sup_total', 'var_linepack_total',
    'linepack_tgs', 'lim_inf_tgs', 'lim_sup_tgs',
    'linepack_tgn', 'lim_inf_tgn', 'lim_sup_tgn',
    'tramo_inicial', 'lim_inf_tramo_inicial', 'lim_sup_tramo_inicial',
    'tramo_final', 'lim_inf_tramo_final', 'lim_sup_tramo_final',
    'tramo_final_tgs', 'tramo_final_tgn',
]


def _num(s):
    """Parse a number into float, or None.

    PS reports come in two number formats: comma decimal ("129,57") in the daily
    template and dot decimal ("166.9") in the heavier weekly one. Values are all
    well under a thousand, so a lone separator is always the decimal point.
    """
    if s is None:
        return None
    s = str(s).strip()
    if s in ('', '-'):
        return None
    if ',' in s and '.' in s:           # e.g. 1.234,5 — dot thousands, comma decimal
        s = s.replace('.', '').replace(',', '.')
    else:
        s = s.replace(',', '.')
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def _ascii(s):
    """Drop accents / mojibake so labels match regardless of PDF encoding."""
    s = unicodedata.normalize('NFKD', s or '')
    return ''.join(c for c in s if ord(c) < 128)


def _cluster_rows(words, tol=5.0):
    """Group words into visual rows. Cell text and its numbers can sit a couple
    of points apart vertically, so we cluster by a tolerance rather than an
    exact top."""
    rows = []
    for w in sorted(words, key=lambda w: w['top']):
        if rows and (w['top'] - rows[-1]['top']) <= tol:
            rows[-1]['words'].append(w)
        else:
            rows.append({'top': w['top'], 'words': [w]})
    for r in rows:
        r['words'].sort(key=lambda w: w['x0'])
    return rows


def _parse_header(rows):
    """Find the header row(s) and resolve the column layout.

    The template comes in two shapes: the daily one ([día1 proj][REAL][día report]
    [día+1]...) and a Monday one that back-fills the weekend with three
    (proj, REAL) pairs before the forecast. Both label every dated column
    "<dayname> <dd> - <mon>" and every actuals column "REAL", so we read those
    rather than assume positions.

    Returns a dict {real_date, real_x, real_daycol_x, forecast, value_min_x} or
    None. `real_date` is the most recent REAL (the report's D-1); `forecast` is a
    list of (x, date_iso) for the days after it.
    """
    # The header is the cluster that holds the 'REAL' token(s).
    header_words = None
    for r in rows:
        if any(_ascii(w['text']).upper() == 'REAL' for w in r['words']):
            header_words = r['words']
            break
    if header_words is None:
        return None

    toks = header_words
    real_xs = sorted(w['x0'] for w in toks if _ascii(w['text']).upper() == 'REAL')

    # year: a token like jun'26 / may'26
    year = None
    for w in toks:
        m = re.search(r"'(\d{2})", w['text'])
        if m:
            year = 2000 + int(m.group(1))
            break
    yr0 = year or date.today().year

    # Dated columns are strictly "<dd> - <mon>": a 1-2 digit day, then a dash,
    # then a month token. Requiring the dash excludes the week range on the
    # "PROYECCION SEMANA: 01 de jun al 07 jun'26" line ("01 de jun", "07 jun'26").
    daycols = []  # (x, date_iso)
    for i, w in enumerate(toks):
        if not re.fullmatch(r'\d{1,2}', w['text']):
            continue
        day = int(w['text'])
        if not (1 <= day <= 31):
            continue
        if i + 2 >= len(toks) or toks[i + 1]['text'] not in ('-', '–'):
            continue
        mon = MONTHS.get(_ascii(toks[i + 2]['text']).lower()[:3])
        if mon is None:
            continue
        daycols.append((w['x0'], mon, day))
    if not daycols:
        return None

    # resolve a week straddling a month/year boundary off the first column
    base_mon = daycols[0][1]
    cols = []
    for x, mon, day in daycols:
        yr = yr0 + 1 if (mon < base_mon and base_mon - mon > 6) else yr0
        cols.append((x, f'{yr:04d}-{mon:02d}-{day:02d}'))
    cols.sort()

    # Each REAL column belongs to the dated column immediately to its left.
    real_date = real_x = real_daycol_x = None
    if real_xs:
        rx = real_xs[-1]  # the most recent REAL = the report's D-1
        left = [(x, d) for x, d in cols if x < rx]
        if left:
            real_daycol_x, real_date = max(left, key=lambda c: c[0])
            real_x = rx
    if real_date is None:  # no REAL label — fall back to the first dated column
        real_daycol_x, real_date = cols[0]

    forecast = sorted((x, d) for x, d in cols if d > real_date)
    all_xs = [x for x, _ in cols] + real_xs
    value_min_x = min(all_xs) - 30
    return {
        'real_date': real_date,
        'real_x': real_x,
        'real_daycol_x': real_daycol_x,
        'forecast': forecast,
        'value_min_x': value_min_x,
    }


def _field_for(label, section):
    """Map a row label (+ current section) to an output field key, or None."""
    L = _ascii(label).lower().strip()

    def has(*subs):
        return all(s in L for s in subs)

    if L.startswith('temperatura'):
        return 'temp_prom_ba'
    if L.startswith('demanda total'):
        return 'demanda_total'
    if has('demanda', 'prioritaria'):
        return 'prioritaria'
    if L.startswith('gas combustible'):
        return 'combustible'
    if L.startswith('gnc'):
        return 'gnc'
    if L.startswith('industria'):
        return 'industria'
    if has('usinas', 'dentro'):
        return 'usinas'
    if has('exportaciones', 'tgn'):
        return 'exp_tgn'
    if has('exportaciones', 'tgs'):
        return 'exp_tgs'
    if L.startswith('inyecciones'):
        return 'iny_total'
    if 'neuba ii' in L:
        return 'iny_neuba2'
    if L.startswith('neuba i'):
        return 'iny_neuba1'
    if L.startswith('sur'):
        return 'iny_sur'
    if L.startswith('patag'):
        return 'iny_patagonico'
    if L.startswith('norte'):
        return 'iny_norte'
    if L.startswith('neuqu'):
        return 'iny_neuquen'
    if L.startswith('enarsa'):
        return 'iny_enarsa'
    if L.startswith('gpfm'):
        return 'iny_gpm'
    if L.startswith('bolivia'):
        return 'iny_bolivia'
    if has('chile'):
        return 'iny_chile'
    if has('peak', 'shaving'):
        return 'peak_shaving'
    if has('buque', 'escobar'):
        return 'iny_escobar'
    if L.startswith('stock'):
        return 'linepack_total'
    if L.startswith('delta'):
        return 'var_linepack_total'
    if L.startswith('tramos iniciales'):
        return 'tramo_inicial'
    if L.startswith('tramos finales'):
        return 'tramo_final'
    if L == 'tgs':
        return {'iny': 'iny_tgs', 'stock': 'linepack_tgs', 'tfin': 'tramo_final_tgs'}.get(section)
    if L == 'tgn':
        return {'iny': 'iny_tgn', 'stock': 'linepack_tgn', 'tfin': 'tramo_final_tgn'}.get(section)
    return None


# section a field belongs to, when it acts as a section header
SECTION_OF = {'iny_total': 'iny', 'linepack_total': 'stock',
              'tramo_inicial': 'tini', 'tramo_final': 'tfin'}


def extract_ps(source, report_date=None):
    """Parse a PS PDF (path or bytes). Returns (real_row, forecast_rows, issues).

    real_row is the D-1 actuals dict (tipo 'R'); forecast_rows is a list of the
    per-day projection dicts (tipo 'P'). report_date (a datetime.date) is used
    only as a fallback for the REAL date when the header can't be parsed.
    """
    issues = []
    opener = pdfplumber.open(source if not isinstance(source, (bytes, bytearray))
                             else io.BytesIO(source))
    with opener as pdf:
        words = pdf.pages[0].extract_words(use_text_flow=False, keep_blank_chars=False)

    rows = _cluster_rows(words)
    h = _parse_header(rows)
    if not h:
        return None, [], ['header: could not parse column anchors']

    # anchors for nearest-column assignment: the D-1 dated column + its REAL
    # column + the forecast columns. Older history columns (the Monday variant's
    # weekend back-fill) are intentionally left out — their values fall onto the
    # nearest kept anchor, where the most-recent one wins because it sits closest.
    real_date = h['real_date']
    real_x = h['real_x']
    forecast_dates = [d for _, d in h['forecast']]
    anchors = [(h['real_daycol_x'], real_date)]
    if real_x is not None:
        anchors.append((real_x, 'REAL'))
    anchors += list(h['forecast'])
    anchors.sort()
    value_min_x = h['value_min_x']

    real_row = {'fecha': real_date, 'tipo': 'R'}
    fc = defaultdict(lambda: {'tipo': 'P'})
    for d in forecast_dates:
        fc[d]['fecha'] = d

    section = None
    for r in rows:
        ws = r['words']
        label_text = ' '.join(w['text'] for w in ws if w['x0'] < value_min_x)
        if not label_text.strip():
            continue
        label_text = label_text.split('MMm')[0]   # drop the unit token tail
        values = [w for w in ws if w['x0'] >= value_min_x and NUM_RE.fullmatch(w['text'])]
        if not values:
            continue

        field = _field_for(LIM_RE.sub('', label_text), section)
        if field in SECTION_OF:
            section = SECTION_OF[field]
        if field is None:
            continue

        # assign each value token to its nearest column anchor
        by_anchor = {}
        for w in values:
            ax, adate = min(anchors, key=lambda a: abs(a[0] - w['x0']))
            by_anchor[adate] = _num(w['text'])

        # REAL/current value: the REAL column, else the día1 column. Tramos
        # iniciales/finales publish no D-1 actual, only the projection from the
        # report day onward — fall back to the report-day column so the field
        # carries a current estimate instead of nothing.
        cur = by_anchor.get('REAL')
        if cur is None:
            cur = by_anchor.get(real_date)
        if cur is None and forecast_dates:
            cur = by_anchor.get(forecast_dates[0])
        if cur is not None:
            real_row[field] = cur
        for d in forecast_dates:
            if d in by_anchor:
                fc[d][field] = by_anchor[d]

        # Min/Max band, if any
        lk = LIMIT_KEYS.get(field)
        if lk:
            m = LIM_RE.search(label_text)
            if m:
                real_row[lk[0]] = _num(m.group(1))
                real_row[lk[1]] = _num(m.group(2))

    if real_row.get('linepack_total') is None and real_row.get('linepack_tgn') is None:
        issues.append(f'{real_date}: no linepack values extracted')

    forecast_rows = [dict(v) for _, v in sorted(fc.items())]
    return real_row, forecast_rows, issues


def load_existing():
    if not os.path.exists(PS_JSON):
        return {}
    import json
    with open(PS_JSON, encoding='utf-8') as f:
        raw = json.load(f)
    data = raw.get('data', raw) if isinstance(raw, dict) else raw
    return {r['fecha']: r for r in (data or []) if r.get('fecha')}


def _report_date_from_name(fname):
    m = re.search(r'PS_(\d{4})(\d{2})(\d{2})', fname)
    if not m:
        return None
    return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))


def main():
    have = load_existing()
    print(f"Starting with {len(have)} existing PS rows in enargas_ps.json")

    pdfs = sorted(glob.glob(os.path.join(RAW_DIR, 'PS_*.pdf')))
    issues = []
    added = 0
    for path in pdfs:
        fname = os.path.basename(path)
        rdate = _report_date_from_name(fname)
        try:
            real_row, _fc, iss = extract_ps(path, report_date=rdate)
        except Exception as e:  # noqa: BLE001 — tolerate one bad PDF
            issues.append(f'{fname}: parse error: {e}')
            continue
        issues += [f'{fname}: {x}' for x in iss]
        if not real_row or not real_row.get('fecha'):
            issues.append(f'{fname}: no REAL row')
            continue
        real_row['source'] = fname
        have[real_row['fecha']] = real_row
        added += 1

    rows = sorted(have.values(), key=lambda r: r.get('fecha') or '')
    latest = rows[-1]['fecha'] if rows else None
    write_json(
        PS_JSON, rows,
        source='ENARGAS Proyección Semanal (PS) — columna REAL',
        source_date=latest,
        issues=issues[-50:],
    )
    write_csv(json_to_csv_path(PS_JSON),
              ({k: r.get(k) for k in PS_FIELDS} for r in rows),
              fieldnames=PS_FIELDS)
    print(f"enargas_ps.json: {len(rows)} rows ({added} parsed this run), latest={latest}")
    if issues:
        print(f"  {len(issues)} issues (see 'issues' in envelope)")


if __name__ == '__main__':
    main()
