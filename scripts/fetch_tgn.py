#!/usr/bin/env python3
"""Scrape TGN ABII portal for nominations, capacity, restrictions and
delivered/injected volumes.

ABII is Java/JSF + PrimeFaces 7 — server-rendered with CSRF tokens,
ViewState and F5 ASM cookies.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

SYSTEM_STATE_DAYS_BACK = 4

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RAW_DIR = os.path.join(ROOT, 'raw')
OUT_DIR = os.path.join(ROOT, 'public', 'data')
STATE_PATH = os.path.join(RAW_DIR, 'tgn_state.json')

BASE_URL = os.environ.get('TGN_BASE_URL', 'https://abii.tgn.com.ar/')
LOGIN_PATH = 'pages/login.xhtml'
PROBE_PATH = 'pages/home.xhtml'

SYSTEM_STATE_PATH = 'pages/reports/system_state/system-state-report.xhtml'
NOMINACIONES_PATH = 'pages/programacion/nominaciones/nominacion.xhtml'


def env_credentials():
    user = (os.environ.get('TGN_USER') or '').strip()
    pw = (os.environ.get('TGN_PASSWORD') or '').strip()
    return user, pw


def login(page, user, pw):
    page.fill('input[id="loginFormId:username"]', user)
    page.fill('input[id="loginFormId:password"]', pw)
    page.click('button[id^="loginFormId:"][type="submit"], '
               'input[id^="loginFormId:"][type="submit"]')
    page.wait_for_load_state('networkidle')


def _is_sentinel(rec):
    a = str(rec.get('Actual') or '').strip()
    e = str(rec.get('Equilibrio') or '').strip()
    d = str(rec.get('Desbalance del sistema') or '').strip().lstrip('-')
    return bool(a) and a == e and d in ('0', '0.0', '')


def scrape_system_state(page):
    today = datetime.now(timezone.utc).date()

    all_rows = []
    headers = []
    
    desde_str = (today - timedelta(days=SYSTEM_STATE_DAYS_BACK)).strftime('%d/%m/%Y')
    hasta_str = today.strftime('%d/%m/%Y')

    # Iterar día por día para forzar a PrimeFaces a cargar exactamente esa fila
    for n in range(SYSTEM_STATE_DAYS_BACK + 1):
        day = today - timedelta(days=n)
        day_str = day.strftime('%d/%m/%Y')
        
        rows, day_headers = _scrape_system_state_day(page, day_str)
        if day_headers and not headers:
            headers = day_headers
        all_rows.extend(rows)

    _save_system_state(all_rows, desde_str, hasta_str, headers)


def _scrape_system_state_day(page, day_str):
    print(f'fetch_tgn: system_state day {day_str}')

    try:
        page.goto(BASE_URL + SYSTEM_STATE_PATH, wait_until='networkidle', timeout=30000)
    except Exception as e:
        print(f'fetch_tgn: failed to open system_state: {e}', file=sys.stderr)
        return [], []

    try:
        page.wait_for_selector(
            'button[id="formulario:report_btnSearch_id"]',
            state='visible', timeout=15000,
        )
        page.wait_for_timeout(500)
    except Exception as e:
        print(f'fetch_tgn: report button never showed up: {e}', file=sys.stderr)
        return [], []

    for fid, value in [
        ('formulario:report_fecha_desde_id_input', day_str),
        ('formulario:report_fecha_hasta_id_input', day_str),
    ]:
        try:
            page.fill(f'input[id="{fid}"]', value)
            page.evaluate(
                "id => document.getElementById(id).dispatchEvent(new Event('change', {bubbles:true}))",
                fid,
            )
        except Exception as e:
            print(f'fetch_tgn: could not set {fid}: {e}', file=sys.stderr)

    try:
        page.click('button[id="formulario:report3_btnSelectAllOperators"]')
        page.wait_for_load_state('networkidle')
    except Exception as e:
        print(f'fetch_tgn: could not select all operators: {e}', file=sys.stderr)

    try:
        page.click('button[id="formulario:report_btnSearch_id"]')
    except Exception as e:
        print(f'fetch_tgn: click Ver reporte failed: {e}', file=sys.stderr)
        return [], []

    try:
        page.wait_for_function(
            """() => {
                const p = document.getElementById('formulario:panelGrilla');
                if (!p) return false;
                const tbls = p.querySelectorAll('table');
                return tbls && tbls.length >= 1 && tbls[0].rows.length >= 2;
            }""",
            timeout=60000,
        )
    except Exception as e:
        print(f'fetch_tgn: panelGrilla never populated: {e}', file=sys.stderr)
        return [], []

    result = page.eval_on_selector(
        'div[id="formulario:panelGrilla"]',
        """p => {
            const tables = Array.from(p.querySelectorAll('table'));
            let mainMatrix = [];
            let statusVal = 'NORMAL';

            const parseTable = (t) => Array.from(t.rows).map(r =>
                Array.from(r.cells).map(c => (c.innerText || c.textContent || '').replace(/\\s+/g, ' ').trim())
            );

            for (const t of tables) {
                const matrix = parseTable(t);
                if (matrix.length < 2) continue;
                
                const headers = matrix[0].map(x => x.toLowerCase());

                // Al consultar 1 solo día, tomamos el Estado directamente de la fila 1
                if (headers.some(x => x.includes('estado'))) {
                    const statusIdx = headers.findIndex(x => x.includes('estado'));
                    if (matrix.length > 1 && matrix[1].length > statusIdx) {
                        statusVal = matrix[1][statusIdx] || 'NORMAL';
                    }
                }

                if (headers.some(x => x.includes('actual') || x.includes('linepack')) && mainMatrix.length === 0) {
                    mainMatrix = matrix;
                }
            }

            if (mainMatrix.length === 0 && tables.length > 0) {
                mainMatrix = parseTable(tables[0]);
            }

            return {
                rows: mainMatrix,
                status: statusVal
            };
        }"""
    )
    
    rows = result.get('rows') or []
    day_status = result.get('status') or 'NORMAL'
    
    raw_headers = rows[0] if rows else []
    headers = [re.sub(r'\s+', ' ', h).strip() for h in raw_headers]

    data_rows = []
    for r in rows[1:]:
        record = {headers[i] if i < len(headers) else f'col_{i}': r[i]
                  for i in range(len(r))}
        
        # Asigna el estado capturado en la tabla secundaria para este día
        record['Estado'] = day_status
        data_rows.append(record)
        
    return data_rows, headers


_MONTHS = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12,
}


def _iso_date(raw):
    if not raw:
        return None
    m = re.match(r'^\w+\s+(\w+)\s+(\d{1,2})\s+\d{2}:\d{2}:\d{2}\s+\w+\s+(\d{4})$', raw)
    if not m:
        return None
    mon = _MONTHS.get(m.group(1))
    if not mon:
        return None
    return f"{m.group(3)}-{mon:02d}-{int(m.group(2)):02d}"


def _save_system_state(rows, desde, hasta, headers):
    out_path = os.path.join(OUT_DIR, 'tgn_system_state.json')
    os.makedirs(OUT_DIR, exist_ok=True)

    def _clean(s):
        return re.sub(r'\s+', ' ', str(s).replace('<br>', ' ')).strip()

    cleaned = []
    for r in rows:
        record = {_clean(k): v for k, v in r.items()}
        record['fecha'] = _iso_date(record.get('Día Operativo'))
        record['Estado'] = str(r.get('Estado') or 'NORMAL').strip()
        cleaned.append(record)

    existing = []
    if os.path.exists(out_path):
        try:
            with open(out_path, encoding='utf-8') as f:
                payload = json.load(f)
            existing = payload.get('data') or []
            if not isinstance(existing, list):
                existing = []
        except (OSError, json.JSONDecodeError):
            existing = []

    merged = {}
    for r in existing:
        f_iso = r.get('fecha')
        if f_iso and not _is_sentinel(r):
            merged[f_iso] = r

    for r in cleaned:
        f_iso = r.get('fecha')
        if f_iso and not _is_sentinel(r):
            merged[f_iso] = r
            
    final_rows = sorted(merged.values(), key=lambda r: r.get('fecha') or '')

    headers = [_clean(h) for h in headers]
    if 'Estado' not in headers:
        headers.append('Estado')

    write_json(
        out_path,
        final_rows,
        source='TGN ABII — Estado del Sistema',
        source_date=hasta,
        query={'desde': desde, 'hasta': hasta, 'gasoducto': 'TODOS'},
        headers=headers,
    )
    write_csv(json_to_csv_path(out_path), final_rows)
    print(f'fetch_tgn: wrote {len(final_rows)} rows to tgn_system_state.json '
          f'({len(cleaned)} from this run, {len(existing)} pre-existing)')


def run():
    user, pw = env_credentials()
    if not user or not pw:
        print('fetch_tgn: TGN_USER/TGN_PASSWORD not set, skipping')
        return 0

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('fetch_tgn: playwright not installed', file=sys.stderr)
        return 1

    os.makedirs(RAW_DIR, exist_ok=True)
    storage = STATE_PATH if os.path.exists(STATE_PATH) else None

    with sync_playwright() as pw_api:
        browser = pw_api.chromium.launch(headless=True)
        context = browser.new_context(storage_state=storage)
        page = context.new_page()

        try:
            page.goto(BASE_URL + PROBE_PATH, wait_until='domcontentloaded')
            if 'login.xhtml' in page.url:
                print(f'fetch_tgn: session missing, logging in (probe={page.url})')
                login(page, user, pw)
                if 'login.xhtml' in page.url:
                    print('fetch_tgn: login failed — still on login page '
                          f'(url={page.url})', file=sys.stderr)
                    return 1
                context.storage_state(path=STATE_PATH)
            else:
                print(f'fetch_tgn: existing session is valid (probe url={page.url})')

            print(f'fetch_tgn: logged in, landing url={page.url}')
            print(f'fetch_tgn: timestamp={datetime.now(timezone.utc).isoformat()}')

            scrape_system_state(page)

        finally:
            browser.close()

    return 0


if __name__ == '__main__':
    sys.exit(run())
