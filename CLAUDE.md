# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Static dashboard (React + TypeScript + Vite) for the Argentine gas transport system. A Python pipeline scrapes public sources, writes JSON files under `public/data/`, and the frontend reads those JSONs at runtime. No backend — the site is a static build deployed to GitHub Pages, rebuilt nightly by a GitHub Action.

Audience is the commercial / dispatch desk at Pluspetrol. UX is in Spanish.

Live: https://mpodeley.github.io/estado-red-gas/

## Commands

The Python path on the dev machine is aliased to the Microsoft Store stub; always use the full path:

```bash
PY="/c/Users/mpodeley/AppData/Local/Programs/Python/Python312/python.exe"
```

Pipeline:
```bash
$PY scripts/build_data.py                      # run every fetcher + parser + forecast + backtest
$PY scripts/<fetcher>.py                       # run a single stage (see scripts/ list)
$PY scripts/backfill_enargas.py --days 730     # one-shot historical backfill
$PY scripts/backfill_enargas.py --days 7 --force  # force re-parse
```

Frontend:
```bash
npm run dev          # Vite dev server (default port 5173, falls back to 5174 if taken)
npx tsc --noEmit     # type check only — CI runs this before the build
npm run build        # tsc + vite build -> dist/
```

Deploy:
```bash
gh workflow run "Update data and deploy" --ref master
gh run list --workflow="Update data and deploy" --limit 3
```

## Architecture

### Data pipeline (Python, `scripts/`)

`build_data.py` orchestrates phases in order:
1. `ingest_incoming.py` — route files dropped in `raw/incoming/` by magic bytes
2. fetchers (`fetch_enargas.py`, `fetch_cammesa.py`, `fetch_cammesa_ppo.py`, `fetch_weather.py`, `fetch_smn_alerts.py`, `fetch_megsa.py`) — one per source
3. parsers (`parse_base_excel.py`, `parse_linepack.py`, `parse_enargas.py`, `parse_cammesa.py`) — Excel / PDF → JSON
4. `generate_forecast.py` — per-segment regressions on RDS history
5. `backtest_forecast.py` — rolling out-of-sample MAE/MAPE
6. Validation: pipeline exits non-zero if required outputs are missing or stale

All JSON outputs share a `{generated_at, source, source_date, data}` envelope written via `_meta.py`'s `write_json()`. The `data` payload shape is per-dataset.

**Merge semantics are critical**: parsers that work off a small set of files in `raw/` (`parse_enargas.py`, `fetch_cammesa_ppo.py`) must *upsert by fecha* into the existing JSON instead of overwriting. Otherwise historical backfills get wiped on the next pipeline run when only a few recent files live in `raw/`. `backfill_enargas.py` and `parse_enargas.py` already load existing rows and upsert — preserve that pattern when adding new parsers.

### Data sources

Every source's current status is in `FuentesPage.tsx` (UI) and `feedback_macro_data.md` (memory). Key sources:

- **ENARGAS RDS** (`RDS_YYYYMMDD.pdf`): the authoritative daily system report. Backfilled 2 years via `descarga.php?path=reporte-diario-sistema&file=...`. Feeds `enargas.json` — linepack total, importaciones, consumos, exportaciones, temp BA.
- **CAMMESA PPO** (`Parte_DDMMAA.xls`): daily post-operative. Fetched through `api.cammesa.com/pub-svc/public/` endpoints (reverse-engineered from the Angular SPA). Files are "encrypted" with Office's default read-only password `VelvetSweatshop` and decrypted in-memory by `msoffcrypto-tool`. Feeds `cammesa_ppo.json`.
- **CAMMESA weekly** (`PS_YYYYMMDD.pdf`): 7-day projection.
- **Open-Meteo** (forecast 14d + historical 2y): 10 Argentine cities.
- **SMN alertas** via `ssl.smn.gob.ar/dpd/zipopendata.php` (the main `www.smn.gob.ar` is Cloudflare-blocked; the open-data mirror isn't).
- **MEGSA**: public API for Henry Hub / TTF / Brent / WTI benchmarks, USD/ARS, auction schedule. Domestic spot still gated behind agent login.
- **Excel base** (manual): still a source of historical demand-by-sector; RDS is progressively replacing it.

### Frontend (`src/`)

- `App.tsx` holds the outlook layout + nav (Outlook / Forecast / Guía / Fuentes / Estado). `useMemo` for derived data (`allDates`, `visibleDates`, `demandY`) sits at the top of `OutlookPage` — it MUST run above any conditional early return or React throws "rendered more hooks than the previous render".
- `hooks/useData.ts` exposes one `useJson<T>()` per dataset. It unwraps the envelope automatically and returns `{ data, loading, error, meta }`.
- `utils/charts.ts` is the shared axis kit: `collectDates`, `padToDates`, `weekendSpans`, `filterDatesByScale`. Every time-series chart pulls from this to stay in sync (shared X range, weekend bands, date tooltip formatter).
- Every Recharts chart sets `syncId="outlook"` so hovering one cursor-lines the others; historical charts set `isAnimationActive={false}` (animation on 365+ points stutters).
- `theme.ts` owns colors and spacing tokens — don't reintroduce inline hex codes.

### Forecast model

`generate_forecast.py` trains per-segment regressions on the 720-day RDS history with a day-of-week residual offset. Feature choices are **measured**, not speculative:

- **Prioritaria**: `HDD(18°C)` of the unweighted mean temp across 10 cities. Backtest MAE 7.18 → 4.13 MMm³/d vs raw BA temp.
- **Usinas (CAMMESA)**: raw BA temp. CDD(22°C) was tested and lost signal in shoulder seasons.
- **Industria, GNC, combustible**: raw BA temp; low R² but stable means.
- **Total demand**: direct regression on `consumo_total_estimado`, *not* sum of segments (linear regressions are additive — the reconstruction gives identical R²).

`backtest_forecast.py` mirrors the same feature choices — if you change features in one file, change both.

## Conventions

- User-facing text is Spanish; comments and variable names English.
- Don't speculate about future model features — measure the improvement first and only ship when the backtest MAE moves. The user is explicit about parsimony: keep the model as simple as the data justifies.
- Data freshness badges live in the Header driven by `generated_at` from each JSON; adding a new dataset means adding it to the `freshness` list in `App.tsx`.
- When a source is blocked (CAMMESA agent auth, MEGSA domestic spot), mark it `blocked` in `FuentesPage` and let the drop folder (`raw/incoming/`) be the manual fallback — don't scaffold speculative scrapers.

## Gotchas

- GitHub Actions commits generated data back to master, so `git push` locally will often need `git pull --rebase` first. Conflicts on `public/data/*.json` are expected — resolve with `git checkout --ours public/data/ && git add public/data/`.
- Large Python backfills go through the PPO API or ENARGAS endpoint at ~150 ms/request; the latter rate-limits aggressively on second passes, so `--force` re-backfills can take 30+ min instead of 5.
- `raw/incoming/README.md` is not a file to parse — `ingest_incoming.py` explicitly ignores it.
- `raw/~$Base Reporte*.xlsx` appears when Excel has the file open; `.gitignore` excludes `~$*`, don't remove that rule.

## Plan / memory

Strategic plan for outstanding work lives at `C:\Users\mpodeley\.claude\plans\toasty-gathering-sparkle.md`. Per-session memory under `C:\Users\mpodeley\.claude\projects\C--Users-mpodeley-Documents-projects-estado-red-gas\memory\` — check it before making architecture-shaping decisions, especially the feedback files on simplicity, macro-data priority, and CAMMESA access.
