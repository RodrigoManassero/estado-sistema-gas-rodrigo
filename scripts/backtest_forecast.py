#!/usr/bin/env python3
"""Rolling-window backtest of the demand forecast.

For each day D in the last `--test-days`, fit the model on all RDS rows
strictly before D (capped at `--train-days` of history), then predict D
using D's actual temperature. Compare to D's observed value.

This isolates MODEL skill from weather-forecast error; it answers
"given we knew the temperature, how well would we have predicted?".

Output:
  public/data/forecast_backtest.json with per-segment MAPE/MAE and a
  day-by-day series of {fecha, actual, predicted, residual} per segment.
"""

import argparse
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _meta import write_json, write_csv, json_to_csv_path  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
ENARGAS_JSON = os.path.join(OUT_DIR, 'enargas.json')
HISTORY_JSON = os.path.join(OUT_DIR, 'weather_history.json')


def load_multi_city_temp():
    """Mean temp across 10 cities per fecha; matches generate_forecast.py."""
    if not os.path.exists(HISTORY_JSON):
        return {}
    wh = load_envelope(HISTORY_JSON)
    by_fecha: dict = {}
    for city in wh or []:
        for h in city.get('history', []):
            if not h.get('fecha'):
                continue
            t = h.get('temp_prom')
            if t is not None:
                by_fecha.setdefault(h['fecha'], []).append(float(t))
    return {k: sum(v) / len(v) for k, v in by_fecha.items() if v}


def load_envelope(path):
    with open(path, encoding='utf-8') as f:
        raw = json.load(f)
    if isinstance(raw, dict) and 'data' in raw and 'generated_at' in raw:
        return raw['data']
    return raw


def linear_regression(pairs):
    n = len(pairs)
    if n < 3:
        return None, None
    sx = sum(x for x, _ in pairs)
    sy = sum(y for _, y in pairs)
    sxy = sum(x * y for x, y in pairs)
    sx2 = sum(x * x for x, _ in pairs)
    denom = n * sx2 - sx * sx
    if abs(denom) < 1e-10:
        return None, None
    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n
    return slope, intercept


def dow_offsets(series, slope, intercept):
    """series: list of (temp, y, fecha_iso)."""
    if slope is None or intercept is None:
        return {i: 0.0 for i in range(7)}
    sums = {i: 0.0 for i in range(7)}
    counts = {i: 0 for i in range(7)}
    for temp, y, fecha in series:
        try:
            d = datetime.strptime(fecha, '%Y-%m-%d').weekday()
        except ValueError:
            continue
        pred = slope * temp + intercept
        sums[d] += y - pred
        counts[d] += 1
    return {i: (sums[i] / counts[i]) if counts[i] else 0.0 for i in range(7)}


def segment_series(rows, key_path, transform=None, temp_override=None):
    transform = transform or (lambda t: t)
    series = []
    for r in rows:
        fecha = r.get('fecha')
        # temp_override maps fecha -> multi-city mean; else use BA tm.
        if temp_override is not None and fecha in temp_override:
            temp = temp_override[fecha]
        else:
            temp = (r.get('temperatura_ba') or {}).get('tm')
        val = r
        for p in key_path:
            if val is None:
                break
            val = val.get(p) if isinstance(val, dict) else None
        if temp is None or val is None or not fecha:
            continue
        try:
            series.append((transform(float(temp)), float(val), fecha))
        except (TypeError, ValueError):
            continue
    return series


def fit_and_predict(train_rows, target_temp, target_fecha, key_path, transform=None, temp_override=None):
    series = segment_series(train_rows, key_path, transform, temp_override)
    pairs = [(t, y) for t, y, _ in series]
    slope, intercept = linear_regression(pairs)
    if slope is None:
        return None
    offsets = dow_offsets(series, slope, intercept)
    try:
        dow = datetime.strptime(target_fecha, '%Y-%m-%d').weekday()
    except ValueError:
        dow = 0
    # Use the multi-city mean for the target too, when available.
    target = temp_override.get(target_fecha) if temp_override and target_fecha in temp_override else target_temp
    x = (transform or (lambda t: t))(target)
    return slope * x + intercept + offsets.get(dow, 0.0)


HDD_BASE = 18.0
CDD_BASE = 22.0


def _hdd(t): return max(0.0, HDD_BASE - t)
def _cdd(t): return max(0.0, t - CDD_BASE)


# (key_path, transform, use_multi_city) — must match generate_forecast.py.
SEGMENTS = {
    'prioritaria': (['consumos', 'prioritaria', 'programa'], _hdd, True),
    'usinas': (['consumos', 'cammesa', 'programa'], None, False),
    'demanda_total': (['consumo_total_estimado'], None, False),
}


def metrics(series):
    """series: list of {fecha, actual, predicted}. Returns {mae, mape, n}."""
    pts = [p for p in series if p['actual'] is not None and p['predicted'] is not None]
    if not pts:
        return {'mae': None, 'mape': None, 'n': 0}
    mae = sum(abs(p['actual'] - p['predicted']) for p in pts) / len(pts)
    mape = sum(abs(p['actual'] - p['predicted']) / p['actual'] for p in pts if p['actual']) / len(pts) * 100
    return {'mae': round(mae, 2), 'mape': round(mape, 2), 'n': len(pts)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--test-days', type=int, default=60, help='how many most-recent days to backtest')
    parser.add_argument('--train-days', type=int, default=365, help='training window size')
    args = parser.parse_args()

    if not os.path.exists(ENARGAS_JSON):
        print('No enargas.json', file=sys.stderr)
        return 1

    rows = sorted(load_envelope(ENARGAS_JSON), key=lambda r: r.get('fecha') or '')
    if len(rows) < args.test_days + 30:
        print(f'Not enough RDS rows ({len(rows)}) to run backtest', file=sys.stderr)
        return 1

    test_rows = rows[-args.test_days:]
    multi_city = load_multi_city_temp()
    print(f"Backtesting {len(test_rows)} days with train window {args.train_days}"
          + (f" · multi-city mean loaded for {len(multi_city)} fechas" if multi_city else ""))

    series_by_seg = {k: [] for k in SEGMENTS}
    for idx, row in enumerate(test_rows):
        fecha = row.get('fecha')
        temp = (row.get('temperatura_ba') or {}).get('tm')
        if not fecha or temp is None:
            continue
        test_pos = len(rows) - len(test_rows) + idx
        train = rows[max(0, test_pos - args.train_days):test_pos]
        for seg_key, (path, transform, use_multi) in SEGMENTS.items():
            actual = row
            for p in path:
                actual = actual.get(p) if isinstance(actual, dict) else None
                if actual is None:
                    break
            try:
                actual_f = float(actual) if actual is not None else None
            except (TypeError, ValueError):
                actual_f = None
            override = multi_city if use_multi else None
            predicted = fit_and_predict(train, float(temp), fecha, path, transform, override)
            series_by_seg[seg_key].append({
                'fecha': fecha,
                'actual': round(actual_f, 2) if actual_f is not None else None,
                'predicted': round(predicted, 2) if predicted is not None else None,
            })

    output = {
        'test_days': args.test_days,
        'train_days': args.train_days,
        'segments': {
            seg: {
                'metrics': metrics(series),
                'series': series,
            }
            for seg, series in series_by_seg.items()
        },
    }

    print("Metrics:")
    for seg, payload in output['segments'].items():
        m = payload['metrics']
        print(f"  {seg:16s} MAE={m['mae']} MMm³/d   MAPE={m['mape']}%   n={m['n']}")

    backtest_path = os.path.join(OUT_DIR, 'forecast_backtest.json')
    write_json(
        backtest_path,
        output,
        source='rolling train/predict on ENARGAS RDS',
    )
    # Long format: one row per (segmento, fecha). Residual = actual - predicted.
    flat = []
    for seg, payload in output['segments'].items():
        for p in payload['series']:
            actual = p.get('actual')
            predicted = p.get('predicted')
            residual = None
            if actual is not None and predicted is not None:
                residual = round(actual - predicted, 2)
            flat.append({
                'segmento': seg,
                'fecha': p.get('fecha'),
                'actual': actual,
                'predicted': predicted,
                'residual': residual,
            })
    write_csv(json_to_csv_path(backtest_path), flat,
              fieldnames=['segmento', 'fecha', 'actual', 'predicted', 'residual'])
    print(f"\nforecast_backtest.json written")
    return 0


if __name__ == '__main__':
    sys.exit(main())
