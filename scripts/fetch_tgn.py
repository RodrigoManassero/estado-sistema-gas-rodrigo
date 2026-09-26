#!/usr/bin/env python3
"""Scrape TGN ABII portal for nominations, capacity, restrictions and
delivered/injected volumes.

ABII is Java/JSF + PrimeFaces 7 — server-rendered with CSRF tokens,
ViewState and F5 ASM cookies. Driving it through a real browser with
Playwright avoids reimplementing JSF's stateful postback dance.

Configuration via env vars (GitHub Action secrets in production):
    TGN_USER             — visualisation account username
    TGN_PASSWORD         — visualisation account password

Local dev: leave them unset and the script no-ops cleanly.

This is the Phase-1 stub: it boots Playwright, logs in, persists the
session to raw/tgn_state.json, and exits. Per-section scrapers are
added in Phase 2 once we've mapped the portal's pages and selectors.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

# Window we ask TGN for on every run. 30 days is enough to keep the
# Operación page's linepack chart populated (it shows the last 7-30
# days) and to recover quickly if the workflow was paused.
SYSTEM_STATE_DAYS_BACK = 30

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RAW_DIR = os.path.join(ROOT, 'raw')
OUT_DIR = os.path.join(ROOT, 'public', 'data')
STATE_PATH = os.path.join(RAW_DIR, 'tgn_state.json')

BASE_URL = os.environ.get('TGN_BASE_URL', 'https://abii.tgn.com.ar/')
LOGIN_PATH = 'pages/login.xhtml'
# A path that requires auth — used both as a probe (to detect whether
# the session is still valid) and as the landing page after login.
PROBE_PATH = 'pages/home.xhtml'

SYSTEM_STATE_PATH = 'pages/reports/system_state/system-state-report.xhtml'
NOMINACIONES_PATH = 'pages/programacion/nominaciones/nominacion.xhtml'


def env_credentials():
    user = (os.environ.get('TGN_USER') or '').strip()
    pw = (os.environ.get('TGN_PASSWORD') or '').strip()
    return user, pw


def login(page, user, pw):
    """Drive the JSF login form. The form id is `loginFormId` and the
    inputs are `loginFormId:username` and `loginFormId:password`."""
    page.fill('input[id="loginFormId:username"]', user)
    page.fill('input[id="loginFormId:password"]', pw)
    page.click('button[id^="loginFormId:"][type="submit"], '
               'input[id^="loginFormId:"][type="submit"]')
    page.wait_for_load_state('networkidle')


def _is_sentinel(rec):
    """The ABII report returns Actual == Equilibrio with a zero desbalance for a
    day that hasn't closed yet — a placeholder, not a real reading. Such days
    must keep being re-queried (the closing value lands later) and must never be
    persisted; otherwise the panel freezes on the equilibrium value, which is the
    133/133/0 bug where every day from 2026-05-29 on showed a fixed linepack."""
    a = str(rec.get('Actual') or '').strip()
    e = str(rec.get('Equilibrio') or '').strip()
    d = str(rec.get('Desbalance del sistema') or '').strip().lstrip('-')
    return bool(a) and a == e and d in ('0', '0.0', '')


def _load_existing_state():
    """Return (all_fechas, sentinel_fechas) from the JSON written on prior runs."""
    out_path = os.path.join(OUT_DIR, 'tgn_system_state.json')
    fechas, sentinels = set(), set()
    if not os.path.exists(out_path):
        return fechas, sentinels
    try:
        with open(out_path, encoding='utf-8') as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError):
        return fechas, sentinels
    for r in (payload.get('data') or []):
        fecha = r.get('fecha')
        if not fecha:
            continue
        fechas.add(fecha)
        if _is_sentinel(r):
            sentinels.add(fecha)
    return fechas, sentinels


def scrape_system_state(page):
    """Iterate Estado del Sistema day-by-day (the report returns a single
    line per query, the most recent closed day inside the range we ask
    for). Each missing day in the last SYSTEM_STATE_DAYS_BACK gets one
    request; previously-fetched days are skipped to keep regular runs
    short. Today is always re-queried in case the closing data updated.
    """
    today = datetime.now(timezone.utc).date()
    today_iso = today.isoformat()
    existing, sentinels = _load_existing_state()

    all_rows = []
    headers = []
    last_desde = last_hasta = ''
    for n in range(SYSTEM_STATE_DAYS_BACK + 1):
        day = today - timedelta(days=n)
        iso = day.isoformat()
        # Re-query today, days we never fetched, and days still stored as a
        # placeholder — those refresh once TGN publishes the real closing value.
        # Days that already carry a real reading stay cached so runs stay short.
        if iso != today_iso and iso in existing and iso not in sentinels:
            continue
        day_str = day.strftime('%d/%m/%Y')
        last_desde = last_hasta = day_str
        rows, day_headers = _scrape_system_state_day(page, day_str)
        if day_headers and not headers:
            headers = day_headers
        all_rows.extend(rows)

    if not last_desde:
        print('fetch_tgn: system_state — nothing to fetch (cache up to date)')
        _save_system_state([], today.strftime('%d/%m/%Y'),
                            today.strftime('%d/%m/%Y'), headers)
        return
    _save_system_state(all_rows, last_desde, last_hasta, headers)


def _scrape_system_state_day(page, day_str):
    """Run a single Estado del Sistema query for day_str (DD/MM/YYYY).
    Returns (rows, headers); rows is at most one element."""
    print(f'fetch_tgn: system_state day {day_str}')

    try:
        page.goto(BASE_URL + SYSTEM_STATE_PATH, wait_until='networkidle', timeout=30000)
    except Exception as e:
        print(f'fetch_tgn: failed to open system_state: {e}', file=sys.stderr)
        return [], []

    # Wait for the page's JSF widgets to finish initialising — the
    # 'comunicación perdida' modal appears when a postback fires before
    # PrimeFaces is fully wired up.
    try:
        page.wait_for_selector(
            'button[id="formulario:report_btnSearch_id"]',
            state='visible', timeout=15000,
        )
        page.wait_for_timeout(1000)
    except Exception as e:
        print(f'fetch_tgn: report button never showed up: {e}', file=sys.stderr)
        return [], []

    # Override the default fecha range with the single day we want.
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

    # The Gasoducto multi-select is required even though its label has
    # no asterisk — hitting 'Ver reporte' with nothing selected returns
    # an error via the JSF growl that surfaces as 'comunicación perdida'
    # because the server response wipes the postback target. Click the
    # 'Seleccionar Todos' button first to populate the field.
    try:
        page.click('button[id="formulario:report3_btnSelectAllOperators"]')
        page.wait_for_load_state('networkidle')
    except Exception as e:
        print(f'fetch_tgn: could not select all operators: {e}', file=sys.stderr)

    # Submit the report. Use the explicit JSF ID rather than role-based
    # lookup so we don't hit a different button with the same label.
    try:
        page.click('button[id="formulario:report_btnSearch_id"]')
    except Exception as e:
        print(f'fetch_tgn: click Ver reporte failed: {e}', file=sys.stderr)
        return [], []

    # Wait for the result panel to actually populate. JSF replaces the
    # panelGrilla's inner content via XHR — we look for a real data
    # table inside it (not just any descendant), with a generous
    # timeout because the report can take a while.
    try:
        page.wait_for_function(
            """() => {
                const p = document.getElementById('formulario:panelGrilla');
                if (!p) return false;
                const tbl = p.querySelector('table');
                return tbl && tbl.rows.length >= 2;
            }""",
            timeout=60000,
        )
    except Exception as e:
        print(f'fetch_tgn: panelGrilla never populated: {e}', file=sys.stderr)
        return [], []

    # Read the result table directly from panelGrilla so we never grab
    # the hidden 'comunicación perdida' message panel by accident.
    result = page.eval_on_selector(
        'div[id="formulario:panelGrilla"] table',
        """t => ({
            id: t.id,
            cls: t.className.slice(0,80),
            rows: Array.from(t.rows).map(r =>
                Array.from(r.cells).map(c => (c.textContent || '').trim())
            )
        })"""
    )
    rows = result.get('rows') or []
    headers = rows[0] if rows else []
    print(f"fetch_tgn: system_state result table id={result.get('id')!r} "
          f"{len(rows)} rows x {len(headers)} cols")

    data_rows = []
    for r in rows[1:]:
        record = {headers[i] if i < len(headers) else f'col_{i}': r[i]
                  for i in range(len(r))}
        data_rows.append(record)
    return data_rows, headers


# Java toString returns e.g. 'Thu May 28 00:00:00 ART 2026' for the
# Día Operativo cell — normalise to YYYY-MM-DD so the JSON sorts and
# joins cleanly against ETGS/daily.
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
    # The HTML uses 'Día <br>Operativo' (with surrounding spaces) for
    # the date column header, which textContent surfaces verbatim. Strip
    # the <br> *and* collapse the resulting double space so the key
    # matches 'Día Operativo' downstream, then surface a normalised
    # 'fecha' (YYYY-MM-DD) so the dashboard can join on it.
    def _clean(s):
        return re.sub(r'\s+', ' ', str(s).replace('<br>', ' ')).strip()

    cleaned = []
    for r in rows:
        record = {_clean(k): v for k, v in r.items()}
        record['fecha'] = _iso_date(record.get('Día Operativo'))
        cleaned.append(record)
    headers = [_clean(h) for h in headers]

    # Upsert against any rows we wrote on previous runs — the public
    # report only goes back ~30 days so without this we'd lose anything
    # older every time we shrink the window.
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
    # Drop placeholder rows (Actual == Equilibrio, zero desbalance): purge any we
    # may have frozen on earlier runs and never persist new ones, so the panel
    # falls back to the last real reading instead of a fake 0% balance. A purged
    # day reverts to "missing" and gets re-queried until its real cierre lands.
    merged = {r.get('fecha'): r for r in existing
              if r.get('fecha') and not _is_sentinel(r)}
    for r in cleaned:
        if r.get('fecha') and not _is_sentinel(r):
            merged[r['fecha']] = r  # newer wins
    final_rows = sorted(merged.values(), key=lambda r: r.get('fecha') or '')

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


def scrape_nominaciones(page):
    """Nominaciones page: the form pre-fills 'Día Operativo' with the
    next gas day and 'Gasoducto' with the user's default operator
    (TGN). 'Cargador' is required and starts empty — we submit anyway
    and report whatever the server returns; if it's a validation error
    we save 0 rows so the dashboard knows to skip the section.
    """
    try:
        page.goto(BASE_URL + NOMINACIONES_PATH, wait_until='networkidle', timeout=30000)
    except Exception as e:
        print(f'fetch_tgn: failed to open nominaciones: {e}', file=sys.stderr)
        return

    try:
        page.wait_for_selector('[id="formulario:panelFiltro"]',
                                state='visible', timeout=30000)
        page.wait_for_timeout(1500)
    except Exception as e:
        print(f'fetch_tgn: nominaciones filter panel never showed: {e}',
              file=sys.stderr)
        return

    # Snapshot the pre-filled values so we can record what was queried.
    try:
        dia_operativo = page.eval_on_selector(
            'input[id="formulario:diaOperativo_input"]', 'e => e.value'
        )
    except Exception:
        dia_operativo = None
    try:
        gasoducto_focus = page.eval_on_selector(
            'input[id="formulario:gasoducto_focus"]', 'e => e.value'
        )
    except Exception:
        gasoducto_focus = None
    print(f'fetch_tgn: nominaciones dia={dia_operativo!r} '
          f'gasoducto={gasoducto_focus!r}')

    # Snapshot table IDs *before* the postback to detect what changed.
    before_ids = page.eval_on_selector_all(
        'table', 'els => els.map(t => t.id)',
    )
    try:
        page.click('button[id="formulario:btnSearch"]')
    except Exception as e:
        print(f'fetch_tgn: click Buscar failed: {e}', file=sys.stderr)
        return
    try:
        page.wait_for_load_state('networkidle', timeout=45000)
    except Exception:
        pass

    # Anything that surfaced after the click is either the result, an
    # inline validation message, or a growl. Cast a wide net so we see
    # whatever appeared.
    after_ids = page.eval_on_selector_all(
        'table', 'els => els.map(t => t.id)',
    )
    new_ids = [i for i in after_ids if i not in before_ids]
    print(f'fetch_tgn: post-submit DOM delta — new table ids: {new_ids[:10]}')

    all_messages = page.eval_on_selector_all(
        '.ui-message, .ui-messages li, .ui-growl-message, '
        '.ui-fileupload-content .ui-messages, span.ui-message-error-detail',
        """els => els.map(e => ({
            cls: e.className.slice(0,80),
            text: (e.textContent || '').trim().slice(0,200)
        })).filter(m => m.text)""",
    )
    if all_messages:
        print(f'fetch_tgn: nominaciones server messages:')
        for m in all_messages[:8]:
            print(f"  cls={m.get('cls')!r} text={m.get('text')!r}")

    error_text = [m.get('text') for m in all_messages
                  if 'error' in (m.get('cls') or '').lower()]
    if error_text:
        _save_nominaciones([], dia_operativo, gasoducto_focus, [], error_text)
        return

    tables = page.eval_on_selector_all(
        'table',
        """els => els.map(t => ({
            id: t.id,
            cls: t.className.slice(0,80),
            rows: Array.from(t.rows).map(r =>
                Array.from(r.cells).map(c => (c.textContent || '').trim())
            )
        }))""",
    )
    skip_id_prefixes = (
        'headerForm:', 'formulario:panelFiltro', 'leadMenu',
    )
    candidates = []
    for t in tables:
        tid = t.get('id') or ''
        cls = t.get('cls') or ''
        rows = t.get('rows') or []
        if any(tid.startswith(p) for p in skip_id_prefixes):
            continue
        if 'messageItem' in cls or 'ui-panelgrid' in cls and len(rows) < 3:
            continue
        if len(rows) < 2:
            continue
        candidates.append(t)
    candidates.sort(key=lambda t: len(t.get('rows') or []), reverse=True)
    if not candidates:
        print('fetch_tgn: no result table found in nominaciones',
              file=sys.stderr)
        _save_nominaciones([], dia_operativo, gasoducto_focus, [], [])
        return

    best = candidates[0]
    rows = best.get('rows') or []
    headers = rows[0] if rows else []
    print(f"fetch_tgn: nominaciones result table id={best.get('id')!r} "
          f"{len(rows)} rows x {len(headers)} cols")
    print(f"  headers={headers}")

    data_rows = []
    for r in rows[1:]:
        record = {headers[i] if i < len(headers) else f'col_{i}': r[i]
                  for i in range(len(r))}
        data_rows.append(record)
    _save_nominaciones(data_rows, dia_operativo, gasoducto_focus, headers, [])


def _save_nominaciones(rows, dia, gasoducto, headers, errors):
    out_path = os.path.join(OUT_DIR, 'tgn_nominaciones.json')
    os.makedirs(OUT_DIR, exist_ok=True)
    rows = [{k.replace('<br>', ' ').strip(): v for k, v in r.items()} for r in rows]
    headers = [h.replace('<br>', ' ').strip() for h in headers]
    write_json(
        out_path,
        rows,
        source='TGN ABII — Nominaciones',
        source_date=dia,
        query={'dia_operativo': dia, 'gasoducto': gasoducto, 'cargador': None},
        headers=headers,
        errors=errors,
    )
    write_csv(json_to_csv_path(out_path), rows)
    print(f'fetch_tgn: wrote {len(rows)} rows to tgn_nominaciones.json')


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
            # Probe a protected path. If it redirects to the login form
            # the session is missing/expired and we authenticate inline;
            # the form action posts to the same URL and lands us back on
            # the protected page on success.
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

            # Phase 3a — Estado del Sistema report.
            scrape_system_state(page)
            # Phase 3b — Nominaciones: scraper exists below but the
            # 'Cargador' field is required and PrimeFaces cancels the
            # postback client-side when it's empty. Re-enable once we
            # know which Cargador value is valid for this account.
            # scrape_nominaciones(page)

            # Phase 2 reconnaissance — keep behind a flag while Phase 3
            # scrapers are still being added. Set TGN_DISCOVER=1 to run
            # the discovery dump again.
            if os.environ.get('TGN_DISCOVER') != '1':
                return 0
            print('--- DISCOVERY: page title ---')
            print(page.title())
            print('--- DISCOVERY: anchors (href, text) ---')
            anchors = page.eval_on_selector_all(
                'a',
                """els => els.map(e => ({
                    href: e.getAttribute('href'),
                    text: (e.textContent || '').trim().slice(0, 100)
                })).filter(a => a.text || (a.href && a.href !== '#'))"""
            )
            for a in anchors[:120]:
                print(f"  href={a.get('href')!r}  text={a.get('text')!r}")
            print(f'--- DISCOVERY: {len(anchors)} anchors total ---')
            print('--- DISCOVERY: menu items (li, span with onclick/role) ---')
            menu_items = page.eval_on_selector_all(
                'li[role="menuitem"], li.ui-menuitem, span[onclick], div[onclick]',
                """els => els.map(e => ({
                    tag: e.tagName.toLowerCase(),
                    id: e.id,
                    text: (e.textContent || '').trim().slice(0, 100),
                    onclick: (e.getAttribute('onclick') || '').slice(0, 200)
                })).filter(x => x.text)"""
            )
            for m in menu_items[:80]:
                print(f"  {m.get('tag')} id={m.get('id')!r} text={m.get('text')!r}")
            print(f'--- DISCOVERY: {len(menu_items)} menu items ---')
            print('--- DISCOVERY: iframes ---')
            for fr in page.frames:
                print(f"  frame name={fr.name!r} url={fr.url!r}")
            # Inspect candidate data pages: dump tables, inputs and a
            # truncated HTML so we can pick selectors for Phase 3.
            for path in [
                'pages/reports/system_state/system-state-report.xhtml',
                'pages/programacion/nominaciones/nominacion.xhtml',
                'pages/programacion/confirmaciones/confirmacionGas.xhtml',
            ]:
                print(f'--- DISCOVERY: navigating {path} ---')
                try:
                    resp = page.goto(BASE_URL + path, wait_until='networkidle', timeout=30000)
                    print(f'  status={resp.status if resp else "?"} url={page.url}')
                    if 'login.xhtml' in page.url:
                        print('  redirected to login — skipping')
                        continue
                    print(f'  title={page.title()!r}')
                    tables = page.eval_on_selector_all(
                        'table',
                        """els => els.map(t => ({
                            id: t.id,
                            cls: t.className.slice(0,80),
                            rows: t.rows.length,
                            cols: t.rows[0] ? t.rows[0].cells.length : 0,
                            firstHeader: t.rows[0]
                                ? Array.from(t.rows[0].cells).map(c => (c.textContent||'').trim().slice(0,40))
                                : []
                        }))"""
                    )
                    print(f'  {len(tables)} table(s):')
                    for t in tables[:15]:
                        print(f"    id={t.get('id')!r} cls={t.get('cls')!r} {t.get('rows')}x{t.get('cols')}")
                        if t.get('firstHeader'):
                            print(f"      headers={t.get('firstHeader')}")
                    inputs = page.eval_on_selector_all(
                        'input:not([type="hidden"]):not([type="submit"]), select, label[for]',
                        """els => els.map(e => ({
                            tag: e.tagName.toLowerCase(),
                            type: e.type || '',
                            id: e.id,
                            name: e.getAttribute('name'),
                            label: (e.tagName === 'LABEL' ? e.textContent : e.getAttribute('aria-label') || e.placeholder || '').trim().slice(0,60)
                        }))"""
                    )
                    print(f'  {len(inputs)} input(s)/label(s):')
                    for i in inputs[:25]:
                        print(f"    {i.get('tag')} type={i.get('type')!r} id={i.get('id')!r} label={i.get('label')!r}")
                except Exception as e:
                    print(f'  error {type(e).__name__}: {str(e)[:200]}')
            print('--- DISCOVERY: end ---')
        finally:
            browser.close()

    return 0


if __name__ == '__main__':
    sys.exit(run())
