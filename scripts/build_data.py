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
        for k in ('forecast', 'days', 'daily', 'weekly', 'rows', 'data'):
            if isinstance(payload.get(k), list):
                return len(payload[k])
    return 0


def _extract_latest_date(payload):
    """Try to find the newest ISO date string in the payload."""
    candidates = []

    def _walk(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in ('fecha', 'date', 'day') and isinstance(v, str) and len(v) >= 10:
                    candidates.append(v[:10])
                else:
                    _walk(v)
        elif isinstance(obj, list):
            for item in obj:
                _walk(item)

    _walk(payload)
    return max(candidates) if candidates else None


def validate_outputs():
    """Fail hard if core files are missing, empty, or severely outdated."""
    failures = []
    now = datetime.now(timezone.utc)

    for fname, reqs in REQUIRED_OUTPUTS.items():
        path = os.path.join(DATA_DIR, fname)

        if not os.path.exists(path):
            failures.append(f"{fname}: File missing")
            continue

        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            failures.append(f"{fname}: Invalid JSON ({e})")
            continue

        rows = _iter_rows(data)
        if rows < reqs['min_rows']:
            failures.append(
                f"{fname}: Insufficient rows ({rows} < {reqs['min_rows']})"
            )

        latest_date_str = _extract_latest_date(data)
        if latest_date_str:
            try:
                latest_dt = datetime.strptime(latest_date_str, '%Y-%m-%d').replace(
                    tzinfo=timezone.utc
                )
                age_days = (now - latest_dt).total_seconds() / 86400.0
                if age_days > reqs['max_age_days']:
                    failures.append(
                        f"{fname}: Stale data (latest date {latest_date_str} is {age_days:.1f} days old, max allowed {reqs['max_age_days']})"
                    )
            except ValueError:
                pass

    return failures


def main():
    errors = 0

    # Phase 1: Fetch/Parse raw data from external sources
    errors += run('fetch_enargas.py')
    errors += run('parse_enargas.py')
    errors += run('fetch_cammesa.py')
    errors += run('fetch_smn.py')
    errors += run('fetch_megsa.py')
    errors += run('fetch_weather.py')
    errors += run('parse_etgs.py')
    errors += run('parse_tgn_system_state.py')
    errors += run('parse_estado_sistema.py')  # <-- NUEVO PARSER AGREGADO AQUÍ

    # Phase 2: Unify daily historical series
    # Must run AFTER the parsers above since it consumes their JSON outputs.
    errors += run('build_daily.py')
    # Paste-ready 'Datos' sheet for the legacy Excel — maps the automatic feeds
    # onto the analyst's manual-entry sheet. Runs after build_daily (consumes
