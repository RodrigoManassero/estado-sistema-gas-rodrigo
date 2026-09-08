#!/usr/bin/env python3
"""Orchestrator: fetch all data sources, parse, and generate JSONs for the dashboard."""

import json
import os
import sys
import subprocess
from datetime import datetime, timezone

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PYTHON = sys.executable
DATA_DIR = os.path.join(SCRIPTS_DIR, '..', 'public', 'data')

# Minimum contract the dashboard needs to render without misleading users.
REQUIRED_OUTPUTS = {
    'daily.json': {'min_rows': 5, 'max_age_days': 14},
    'weather.json': {'min_rows': 1, 'max_age_days': 2},
    'demand_forecast.json': {'min_rows': 1, 'max_age_days': 2},
}


def run(script):
    print(f"\n{'='*60}")
    print(f"Running {script}...")
    print('='*60)
    result = subprocess.run(
        [PYTHON, os.path.join(SCRIPTS_DIR, script)],
        capture_output=False,
        cwd=os.path.join(SCRIPTS_DIR, '..'),
    )
    if result.returncode != 0:
        print(f"WARNING: {script} exited with code {result.returncode}")
    return result.returncode


def _iter_rows(payload):
    """Count rows in a payload whether it's an array or an object with common
    array-valued keys (forecast, days, daily, weekly)."""
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        for key in ('forecast', 'days', 'daily', 'weekly'):
            if isinstance(payload.get(key), list):
                return len(payload[key])
        return 1 if payload else 0
    return 0


def validate_outputs():
    """Run sanity checks on the produced JSONs. Returns number of failures."""
    failures = []
    now = datetime.now(timezone.utc)

    for name, spec in REQUIRED_OUTPUTS.items():
        path = os.path.join(DATA_DIR, name)
        if not os.path.exists(path):
            failures.append(f"{name}: file missing")
            continue
        try:
            with open(path, encoding='utf-8') as f:
                envelope = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            failures.append(f"{name}: unreadable ({e})")
            continue

        if not isinstance(envelope, dict) or 'generated_at' not in envelope:
            failures.append(f"{name}: missing envelope metadata")
            continue

        # Age check (file mtime is a safe approximation when generated_at is fresh).
        try:
            generated = datetime.fromisoformat(envelope['generated_at'])
        except ValueError:
            failures.append(f"{name}: bad generated_at value")
            continue
        if generated.tzinfo is None:
            generated = generated.replace(tzinfo=timezone.utc)
        age_days = (now - generated).total_seconds() / 86400
        if age_days > spec['max_age_days']:
            failures.append(f"{name}: stale ({age_days:.1f} days old, limit {spec['max_age_days']})")

        rows = _iter_rows(envelope.get('data'))
        if rows < spec['min_rows']:
            failures.append(f"{name}: only {rows} rows (min {spec['min_rows']})")

        # Every required tabular JSON should have a sibling CSV for download
        # from the Fuentes page. Missing CSV => audit story broken.
        csv_path = path[:-5] + '.csv'  # .json -> .csv
        if not os.path.exists(csv_path):
            failures.append(f"{name}: sibling CSV missing ({os.path.basename(csv_path)})")

    if failures:
        print("\nValidation FAILED:", file=sys.stderr)
        for msg in failures:
            print(f"  - {msg}", file=sys.stderr)
    else:
        print("\nValidation OK: all required outputs present and fresh")

    return len(failures)


def main():
    print("Estado del Sistema - Data Build Pipeline")
    print('='*60)

    errors = 0

    # Phase 0: Pull email attachments (no-op if GMAIL_APP_PASSWORD unset),
    # then route raw/incoming/ -> raw/.
    errors += run('fetch_inbox.py')
    errors += run('ingest_incoming.py')

    # Phase 1: Fetch new data
    errors += run('fetch_enargas.py')
    errors += run('fetch_enargas_ing.py')
    errors += run('fetch_enargas_ps.py')
    errors += run('fetch_cammesa.py')
    errors += run('fetch_weather.py')
    # 2-year temperature archive (Open-Meteo). Cheap (10 cities), and keeping it
    # fresh feeds both the forecast training and the Datos carga sheet (Tucumán /
    # Esquel actuals). The archive lags ~5 days, so the latest days stay blank.
    errors += run('fetch_weather_history.py')
    errors += run('fetch_smn_alerts.py')
    errors += run('fetch_megsa.py')
    errors += run('fetch_enargas_estadisticas.py')
    errors += run('fetch_enargas_provincias.py')
    # Keep the PPO fetcher to a short window on daily runs; backfills are
    # done manually via `fetch_cammesa_ppo.py --days N --force`.
    errors += run('fetch_cammesa_ppo.py')
    # Cap IV (Secretaría de Energía) — monthly upstream production by block.
    # Streams current + previous year CSVs and skips download if Last-Modified
    # hasn't changed, so daily runs are cheap.
    errors += run('fetch_capiv.py')
    # Pozos terminados (Secretaría de Energía) — monthly completed-well counts
    # per block, the public proxy for drilling activity. Single all-history CSV;
    # skips the ~190 MB download when the resource's Last-Modified is unchanged.
    errors += run('fetch_pozos_terminados.py')

    # Phase 2: Parse all sources.
    # The manual Excel (parse_base_excel.py) is retired: daily.json is now built
    # by build_daily.py from the automatic feeds, with the Excel-era manual rows
    # frozen once in daily_history.json. Run parse_base_excel.py by hand only to
    # re-import historical Excel rows into that snapshot.
    errors += run('parse_linepack.py')
    errors += run('parse_enargas.py')
    errors += run('parse_enargas_ing.py')
    errors += run('parse_enargas_ps.py')
    errors += run('parse_etgs.py')
    errors += run('parse_cammesa.py')
    # Merge the automatic feeds (+ frozen history) into daily.json. Must run
    # after the parsers above since it consumes their JSON outputs.
    errors += run('build_daily.py')
    # Paste-ready 'Datos' sheet for the legacy Excel — maps the automatic feeds
    # onto the analyst's manual-entry sheet. Runs after build_daily (consumes
    # daily.json + enargas_ps.json + cammesa_ppo.json + weather_history.json).
    errors += run('generate_datos_sheet.py')

    # Phase 3: Generate forecast + auto-comments
    errors += run('generate_forecast.py')
    # Phase 3b: Rolling backtest for forecast credibility.
    errors += run('backtest_forecast.py')
    # Phase 3c: Linepack projection + gap-fill (lee daily.json + weather.json;
    # archivo separado para no realimentar daily.json).
    errors += run('generate_linepack_forecast.py')

    # Phase 4: Validate outputs — this decides exit code.
    validation_failures = validate_outputs()

    print(f"\n{'='*60}")
    if errors:
        print(f"Sub-scripts reported {errors} non-zero exit codes (may be recoverable).")

    if os.path.exists(DATA_DIR):
        for f in sorted(os.listdir(DATA_DIR)):
            size = os.path.getsize(os.path.join(DATA_DIR, f))
            print(f"  {f}: {size:,} bytes")

    if validation_failures:
        print(f"\nPipeline FAILED: {validation_failures} required outputs did not pass validation",
              file=sys.stderr)
        return 1

    print("\nPipeline finished OK — JSONs in public/data/ are ready for the dashboard")
    return 0


if __name__ == '__main__':
    sys.exit(main())
