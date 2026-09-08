#!/usr/bin/env python3
"""Parse ENARGAS Reporte Diario del Sistema (RDS_YYYYMMDD.pdf) into JSON.

The RDS is the daily system estimate published by ENARGAS; it's fully public
and carries most of the macro figures we currently source from the manual
Excel:
 - Line pack total del sistema + delta
 - Importaciones (Bolivia / Chile / Escobar / Bahía Blanca)
 - Exportaciones TGN / TGS
 - Consumo estimado por segmento (prioritaria, CAMMESA, industria, GNC, combustible)
 - Temperatura Buenos Aires del día + forecast 6 días

Parser is tolerant: if a field is missing from a given PDF it's just omitted
from the output (not fatal). A global `issues` list is written alongside.
"""

import json
import os
import re
import sys
import glob

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
ENARGAS_JSON = os.path.join(OUT_DIR, 'enargas.json')

MONTHS = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
    'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9,
    'octubre': 10, 'noviembre': 11, 'diciembre': 12,
}

REQUIRED_FIELDS = {'fecha', 'linepack_total'}


def num(s):
    """Parse a Spanish number (comma decimal) into float, or None."""
    if s is None:
        return None
    s = str(s).strip()
    if s == '' or s == '-':
        return None
    s = s.replace('.', '').replace(',', '.') if ',' in s and s.count(',') == 1 else s.replace(',', '.')
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def parse_spanish_date(text):
    """Parse 'lunes, 20 de abril de 2026' -> '2026-04-20'. Returns None if no match."""
    m = re.search(r'(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})', text)
    if not m:
        return None
    day = int(m.group(1))
    month = MONTHS.get(m.group(2).lower())
    year = int(m.group(3))
    if not month:
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"


def extract_rds(text):
    """Extract structured fields from a decoded RDS PDF text."""
    d = {}

    # Día operativo
    m = re.search(r'D[ií]a Operativo:\s*([^\n]+)', text)
    if m:
        fecha = parse_spanish_date(m.group(1))
        if fecha:
            d['fecha'] = fecha

    # Line Pack and Delta
    m = re.search(r'Line\s*Pack\s*:?\s*([\d.,]+)\s*MM', text, re.I)
    if m:
        d['linepack_total'] = num(m.group(1))
    m = re.search(r'Delta\s*:?\s*([-\d.,]+)\s*MM', text, re.I)
    if m:
        d['linepack_delta'] = num(m.group(1))

    # Importaciones rows, 4 cols:
    #   Programa (MMm³/d) | Próximo barco (fecha "DD-MMM" or "-") | Prom Mes prev-year | Misma Sem prev-year
    # The second column is NOT a volume; it's the date of the next LNG cargo
    # (e.g. "18-jul" for Escobar). We parse it as text and keep it only when
    # it's meaningful (skip the "-" placeholder).
    importaciones = {}
    for key, label in [
        ('bolivia', 'Bolivia'),
        ('chile', 'Chile'),
        ('escobar', 'Escobar'),
        ('bahia_blanca', r'Bah[ií]a\s*Blanca'),
    ]:
        pattern = rf'{label}\s+([\d.,-]+)\s+(\S+)\s+([\d.,-]+)\s+([\d.,-]+)'
        m = re.search(pattern, text)
        if m:
            prox = m.group(2).strip()
            importaciones[key] = {
                'programa': num(m.group(1)),
                'proximo_barco': prox if prox and prox != '-' else None,
                'prom_mes_prev_year': num(m.group(3)),
                'misma_semana_prev_year': num(m.group(4)),
            }
    if importaciones:
        d['importaciones'] = importaciones

    # Exportaciones TGN / TGS
    exportaciones = {}
    for key, label in [
        ('tgn', 'Exportaciones en el Sistema de Transporte TGN'),
        ('tgs', 'Exportaciones en el Sistema de Transporte TGS'),
    ]:
        m = re.search(rf'{label}\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)', text)
        if m:
            exportaciones[key] = {
                'vol_exportar': num(m.group(1)),
                'prom_mes_2025': num(m.group(2)),
                'misma_semana_2025': num(m.group(3)),
            }
    if exportaciones:
        d['exportaciones'] = exportaciones

    # Consumos estimados
    consumos = {}
    for key, label in [
        ('prioritaria', 'Demanda Prioritaria'),
        ('cammesa', r'CAMMESA\s*\(\*\)'),
        ('industria', r'Industria\s*\(P3\+GU\)'),
        ('gnc', 'GNC'),
        ('combustible', 'Combustible'),
    ]:
        m = re.search(rf'{label}\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)', text)
        if m:
            consumos[key] = {
                'programa': num(m.group(1)),
                'prom_mes_2025': num(m.group(2)),
                'misma_semana_2025': num(m.group(3)),
            }
    if consumos:
        d['consumos'] = consumos

    # Total consumo — the PDF splits "TOTAL ... 122,9 MM m3/día ... Transporte"
    # across two lines, so use DOTALL and a reasonable ceiling on the gap.
    m = re.search(r'TOTAL[\s\S]{0,120}?([\d.,]+)\s*MM\s*m', text)
    if m:
        d['consumo_total_estimado'] = num(m.group(1))

    # Temperature for día operativo: "lunes, 20 de abril de 2026 19 23 21,0 18,1 19,0"
    # Followed by: "Mayormente nublado..."
    # Pattern: date_line + 5 numbers (min, max, tm, tm_2025, tm_misma_semana)
    if d.get('fecha'):
        pattern = rf'{re.escape("")}(\d+)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)'
        # Simpler approach: locate a line with the fecha word "abril" then 5 numbers.
        m = re.search(r'de\s+\w+\s+de\s+\d{4}\s+(\d+)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)', text)
        if m:
            d['temperatura_ba'] = {
                'min': num(m.group(1)),
                'max': num(m.group(2)),
                'tm': num(m.group(3)),
                'tm_2025': num(m.group(4)),
                'tm_misma_semana': num(m.group(5)),
            }

    # 6-day forecast table. Lines look like:
    #   "martes, 21 de abril de 2026 19 23 21"
    forecast = []
    for m in re.finditer(
        r'(\w+),\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s+(\d+)\s+(\d+)\s+([\d.,]+)',
        text,
    ):
        month = MONTHS.get(m.group(3).lower())
        if not month:
            continue
        fecha = f"{int(m.group(4)):04d}-{month:02d}-{int(m.group(2)):02d}"
        forecast.append({
            'fecha': fecha,
            'min': num(m.group(5)),
            'max': num(m.group(6)),
            'tm': num(m.group(7)),
        })
    # Drop duplicates (same fecha may appear for the current day).
    seen = set()
    dedup = []
    for item in forecast:
        if item['fecha'] in seen:
            continue
        seen.add(item['fecha'])
        dedup.append(item)
    if dedup and d.get('fecha'):
        # Keep only future days relative to fecha.
        dedup = [f for f in dedup if f['fecha'] > d['fecha']]
    if dedup:
        d['forecast_temp_ba'] = dedup

    return d


def parse_rds_pdf(path):
    with pdfplumber.open(path) as pdf:
        text = '\n'.join((p.extract_text() or '') for p in pdf.pages)
    d = extract_rds(text)
    d['source'] = os.path.basename(path)
    return d


def load_existing():
    """Keep backfilled rows (historical dates) that have no PDF in raw/."""
    if not os.path.exists(ENARGAS_JSON):
        return {}
    with open(ENARGAS_JSON, encoding='utf-8') as f:
        raw = json.load(f)
    data = raw.get('data', raw) if isinstance(raw, dict) else raw
    return {r['fecha']: r for r in (data or []) if r.get('fecha')}


ENARGAS_CSV_COLS = [
    'fecha', 'source',
    'linepack_total', 'linepack_delta', 'consumo_total_estimado',
    'temp_min_ba', 'temp_max_ba', 'temp_tm_ba', 'temp_tm_2025', 'temp_tm_misma_semana',
    'imp_bolivia', 'imp_chile', 'imp_escobar', 'imp_bahia_blanca',
    'imp_escobar_proximo_barco', 'imp_bahia_blanca_proximo_barco',
    'cons_prioritaria', 'cons_cammesa', 'cons_industria', 'cons_gnc', 'cons_combustible',
    'exp_tgn', 'exp_tgs',
]


def flatten_for_csv(row):
    """Flatten one RDS row (possibly slim) to a CSV-friendly flat dict.

    Columns defined in ENARGAS_CSV_COLS. Missing nested fields render empty.
    """
    t = row.get('temperatura_ba') or {}
    imps = row.get('importaciones') or {}
    cons = row.get('consumos') or {}
    exps = row.get('exportaciones') or {}

    def imp(key, field='programa'):
        v = imps.get(key) or {}
        return v.get(field)

    def cn(key):
        v = cons.get(key) or {}
        return v.get('programa')

    def ex(key):
        v = exps.get(key) or {}
        return v.get('vol_exportar')

    return {
        'fecha': row.get('fecha'),
        'source': row.get('source'),
        'linepack_total': row.get('linepack_total'),
        'linepack_delta': row.get('linepack_delta'),
        'consumo_total_estimado': row.get('consumo_total_estimado'),
        'temp_min_ba': t.get('min'),
        'temp_max_ba': t.get('max'),
        'temp_tm_ba': t.get('tm'),
        'temp_tm_2025': t.get('tm_2025'),
        'temp_tm_misma_semana': t.get('tm_misma_semana'),
        'imp_bolivia': imp('bolivia'),
        'imp_chile': imp('chile'),
        'imp_escobar': imp('escobar'),
        'imp_bahia_blanca': imp('bahia_blanca'),
        'imp_escobar_proximo_barco': imp('escobar', 'proximo_barco'),
        'imp_bahia_blanca_proximo_barco': imp('bahia_blanca', 'proximo_barco'),
        'cons_prioritaria': cn('prioritaria'),
        'cons_cammesa': cn('cammesa'),
        'cons_industria': cn('industria'),
        'cons_gnc': cn('gnc'),
        'cons_combustible': cn('combustible'),
        'exp_tgn': ex('tgn'),
        'exp_tgs': ex('tgs'),
    }


def slim_row(row):
    """Drop fields the dashboard doesn't need on historical rows.

    Current day keeps the full row (PulseCard/SystemFlowPanel use the prev-year
    comparisons and forecast_temp_ba); every prior day is slimmed to the fields
    used by the historical / YoY / pulse charts. Cuts ~75% off the per-row size.
    """
    slim = {
        'fecha': row.get('fecha'),
        'source': row.get('source'),
        'linepack_total': row.get('linepack_total'),
        'linepack_delta': row.get('linepack_delta'),
        'consumo_total_estimado': row.get('consumo_total_estimado'),
    }
    t = row.get('temperatura_ba') or {}
    if any(v is not None for v in t.values()):
        slim['temperatura_ba'] = {'min': t.get('min'), 'max': t.get('max'), 'tm': t.get('tm')}
    imps = row.get('importaciones') or {}
    imps_slim = {}
    for k, v in imps.items():
        if not v:
            continue
        prog = v.get('programa')
        prox = v.get('proximo_barco')
        if prog is None and not prox:
            continue
        trim = {'programa': prog}
        if prox:
            trim['proximo_barco'] = prox
        imps_slim[k] = trim
    if imps_slim:
        slim['importaciones'] = imps_slim
    cons = row.get('consumos') or {}
    cons_slim = {k: {'programa': v.get('programa')} for k, v in cons.items() if v and v.get('programa') is not None}
    if cons_slim:
        slim['consumos'] = cons_slim
    exps = row.get('exportaciones') or {}
    exps_slim = {
        k: {'vol_exportar': v.get('vol_exportar')}
        for k, v in exps.items()
        if v and v.get('vol_exportar') is not None
    }
    if exps_slim:
        slim['exportaciones'] = exps_slim
    return slim


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    rds_pdfs = sorted(glob.glob(os.path.join(RAW_DIR, 'RDS_*.pdf')))
    legacy = sorted(glob.glob(os.path.join(RAW_DIR, 'ETGS*.pdf')))

    # Start from whatever is already in enargas.json (preserves backfilled rows).
    by_date = load_existing()
    print(f"Loaded {len(by_date)} existing rows; processing {len(rds_pdfs)} RDS PDFs from raw/")

    issues = []

    for p in rds_pdfs:
        try:
            with open(p, 'rb') as fh:
                if fh.read(5) != b'%PDF-':
                    issues.append(f"{os.path.basename(p)}: not a valid PDF (skipped)")
                    continue
            row = parse_rds_pdf(p)
            missing = REQUIRED_FIELDS - row.keys()
            if missing:
                issues.append(f"{os.path.basename(p)}: missing {sorted(missing)}")
            # Upsert by fecha; PDF from raw/ always wins over stored row for that date
            if row.get('fecha'):
                by_date[row['fecha']] = row
            print(
                f"Parsed {os.path.basename(p)}: "
                f"fecha={row.get('fecha')} LP={row.get('linepack_total')} "
                f"total={row.get('consumo_total_estimado')}"
            )
        except Exception as e:
            issues.append(f"{os.path.basename(p)}: exception {e}")
            print(f"Error parsing {p}: {e}", file=sys.stderr)

    rows = sorted(by_date.values(), key=lambda r: r.get('fecha') or '')

    # Slim all but the latest row — historical rows only need what the
    # dashboard charts actually plot.
    if rows:
        rows = [slim_row(r) for r in rows[:-1]] + [rows[-1]]

    if legacy and not rows:
        issues.append(f"Found {len(legacy)} legacy ETGS PDFs but no RDS — format likely changed")

    if issues:
        print("WARN: ENARGAS parse issues:", file=sys.stderr)
        for msg in issues:
            print(f"  {msg}", file=sys.stderr)

    latest = max((r.get('fecha') for r in rows if r.get('fecha')), default=None)
    write_json(
        ENARGAS_JSON,
        rows,
        source='ENARGAS Reporte Diario del Sistema (RDS)',
        source_date=latest,
        issues=issues,
    )
    write_csv(
        json_to_csv_path(ENARGAS_JSON),
        (flatten_for_csv(r) for r in rows),
        fieldnames=ENARGAS_CSV_COLS,
    )
    print(f"enargas.json: {len(rows)} reports")


if __name__ == '__main__':
    main()
