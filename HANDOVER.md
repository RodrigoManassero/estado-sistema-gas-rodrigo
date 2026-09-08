# HANDOVER — Estado del Sistema Dashboard

**Last session**: 2026-04-21
**Branch**: master
**Live**: https://mpodeley.github.io/estado-red-gas/
**Repo**: https://github.com/mpodeley/estado-red-gas

---

## TL;DR

Dashboard operativo del sistema de transporte de gas argentino para el equipo comercial/despacho de Pluspetrol. Pipeline Python scrapea fuentes públicas → JSONs en `public/data/` → app React estática en GitHub Pages. Sin backend. Se reconstruye automáticamente cada día por GitHub Actions.

---

## Qué hay hoy (2026-04-21)

### Fuentes ingestadas automáticamente
- **ENARGAS RDS** (diario) — PDF `RDS_YYYYMMDD.pdf` vía `descarga.php`. Linepack total, importaciones, consumos, exportaciones, temp BA. **Backfill 2 años** ya cargado (`backfill_enargas.py`).
- **CAMMESA PPO** (diario) — `Parte_DDMMAA.xls` vía API pública `api.cammesa.com/pub-svc/public/`. Decrypt in-memory con `VelvetSweatshop` (msoffcrypto-tool).
- **CAMMESA weekly** (semanal) — `PS_YYYYMMDD.pdf`, proyección 7 días.
- **Open-Meteo** (diario) — forecast 14 días + histórico 2 años, **10 ciudades argentinas**.
- **SMN alertas** — mirror `ssl.smn.gob.ar/dpd/zipopendata.php` (la principal está Cloudflare-blocked).
- **MEGSA** — API pública: Henry Hub, TTF, Brent, WTI, USD/ARS, calendario de subastas.
- **ENARGAS monthly** — XLSXs GRT (Cuenca/Gasoducto), Contratos, GED (gas entregado por distribuidora).
- **Excel base** (manual) — en reemplazo progresivo por RDS.

### Páginas
1. **Outlook** — KPIs, comentarios auto-generados, paneles TGS/TGN, forecast 14d, comparación semanal, charts, inyecciones, SystemFlowPanel, restricciones, PulseCard, mapa de red.
2. **Forecast** — backtest rolling (MAE/MAPE por segmento), features del modelo, calidad por horizonte.
3. **Guía** — documentación in-app.
4. **Fuentes** — estado de las 10+ fuentes (OK/blocked/manual).
5. **Estado** — progreso del proyecto.

### NetworkMap (pieza central de la dimensión geográfica)
- Topología real de gasoductos (71 nodos + 76 routes) portada de `mpodeley/gasoductos`.
- Polígonos de las 9 distribuidoras con colores por operador.
- Burbujas cuenca (oferta, desde ENARGAS GRT) + burbujas distribuidora (demanda real GED).
- Líneas coloreadas por operador (TGN/TGS/GPNK/Camuzzi/Export); donde hay capacidad+corte (CCO, Neuba I/II, Gas Andes) pasa a coloreo por stress verde→rojo.
- Hover: tooltip con caudal/capacidad/stress por ruta.
- **Labels 5x baseline** (fontScale = 0.24) tras iteración con el usuario.

### Modelo de forecast
- 720 días de histórico RDS, regresión por segmento con **day-of-week residual offset**.
- **Prioritaria**: HDD(18°C) con mean temp de 10 ciudades (no ponderada por pop — testeado, peor). Backtest MAE 7.18 → 4.13 MMm³/d.
- **Usinas**: raw temp BA (CDD(22°C) probado y descartado — cero en shoulder seasons).
- **Total**: regresión directa sobre `consumo_total_estimado`, NO suma de segmentos (tested: la suma compunde errores, R²=-7.3).
- Backtest rolling genera `forecast_backtest.json` con MAE/MAPE por horizonte.

---

## Stack

- **Frontend**: React 19 + TypeScript + Vite 7 + Recharts. SVG estático para NetworkMap.
- **Python**: 3.12 (openpyxl, pdfplumber, requests, xlrd, msoffcrypto-tool, beautifulsoup4).
- **CI/CD**: GitHub Actions cron diario (9 UTC = 6 AM ARG) + trigger manual. Commitea data back a master.
- **Hosting**: GitHub Pages (rama `gh-pages`).

### Python path (alias de Windows apunta al Store stub, usar siempre full path)
```bash
PY="/c/Users/mpodeley/AppData/Local/Programs/Python/Python312/python.exe"
```

### Comandos usuales
```bash
$PY scripts/build_data.py                       # pipeline completo
$PY scripts/backfill_enargas.py --days 730      # backfill histórico
npm run dev                                      # Vite dev server
npx tsc --noEmit                                 # typecheck
npm run build                                    # tsc + vite build
gh workflow run "Update data and deploy" --ref master
```

---

## Estructura

```
scripts/
  _meta.py                       # envelope {generated_at, source, source_date, data}
  build_data.py                  # orquestador con validación + exit codes
  ingest_incoming.py             # rutea raw/incoming/ por magic bytes
  fetch_enargas.py               # RDS diario
  fetch_cammesa.py               # semanal (PS PDF)
  fetch_cammesa_ppo.py           # diario (Parte .xls)
  fetch_enargas_estadisticas.py  # XLSX mensuales (GRT/Contratos/GED)
  fetch_weather.py               # Open-Meteo forecast 14d 10 ciudades
  fetch_weather_history.py       # Open-Meteo histórico 2y
  fetch_smn_alerts.py            # alertas SMN
  fetch_megsa.py                 # benchmarks internacionales
  backfill_enargas.py            # backfill RDS 2 años (upsert)
  parse_base_excel.py
  parse_linepack.py
  parse_enargas.py               # MERGE by fecha (upsert — crítico)
  parse_cammesa.py
  generate_forecast.py           # regresión por segmento + DOW offset
  backtest_forecast.py           # rolling out-of-sample MAE/MAPE

public/data/
  daily.json, enargas.json, cammesa_ppo.json, cammesa_weekly.json,
  weather.json, weather_regions.json, weather_history.json,
  smn_alerts.json, megsa.json, enargas_monthly.json,
  demand_forecast.json, forecast_backtest.json,
  gas_network.json (topología), ar_outline.json, distribuidoras.geojson,
  tramos.json, linepack.json, comments.json, comments_manual.json

src/
  App.tsx                        # layout + nav + freshness banner
  theme.ts                       # tokens de color/espacio (no hex inline)
  hooks/useData.ts               # useJson<T>() genérico + wrappers tipados
  utils/charts.ts                # axis kit compartido (dates, weekendSpans)
  components/
    NetworkMap.tsx               # SVG con topología real + operadores + bubbles
    SystemFlowPanel.tsx
    TransportRestrictionsPanel.tsx
    TramoNetworkPanel.tsx
    PulseCard.tsx
    GasoductoFlowChart.tsx       # RegionalSection con stacked areas
    (+ charts: Demand, DemandForecast, Linepack, Temperature, FuelMix, ...)
```

---

## Convenciones críticas

- Texto UI en español; comentarios y código en inglés.
- **Parsimonia**: no agregar features al modelo sin medir mejora en backtest. Usuario explícito en mantenerlo simple.
- **Merge semantics en parsers**: los que trabajan con pocos archivos en `raw/` (parse_enargas, fetch_cammesa_ppo) DEBEN hacer upsert por fecha en el JSON existente — si no, el backfill se borra en la próxima corrida.
- **Hooks antes de early returns** en React (useMemo en OutlookPage) — si no, "Rendered more hooks than during the previous render".
- **Recharts**: todos los time-series con `syncId="outlook"` (cursor compartido) y `isAnimationActive={false}` para series >365 puntos.
- **Envelope JSON**: todo output `{generated_at, source, source_date, data}` vía `_meta.write_json()`.
- **Freshness banner** en Header: se alimenta de `generated_at` de cada JSON. Agregar nuevo dataset = sumarlo a la lista `freshness` en App.tsx.
- **Fuentes bloqueadas** (CAMMESA agent auth, MEGSA domestic spot): marcar `blocked` en FuentesPage; usar `raw/incoming/` como fallback manual.

---

## Gotchas conocidos

- GitHub Actions commitea data a master → `git push` local requiere `git pull --rebase` antes. Conflictos en `public/data/*.json` se resuelven con `git checkout --ours public/data/ && git add public/data/`.
- Backfills grandes del endpoint ENARGAS tienen rate-limit agresivo en la segunda pasada (`--force` puede tardar 30+ min vs 5).
- `raw/incoming/README.md` NO es archivo a parsear — `ingest_incoming.py` lo ignora explícito.
- `raw/~$Base Reporte*.xlsx` aparece cuando Excel tiene el archivo abierto; `.gitignore` lo excluye.
- CAMMESA PPO viene "encriptado" con password `VelvetSweatshop` (Office default read-only).
- ENARGAS datos-operativos es JS-rendered — no scrapear el HTML; usar `descarga.php` con header Referer.
- MEGSA: `www.megsa.com.ar` tiene SSL mismatch, usar `megsa.ar`.

---

## Último trabajo (sesión 2026-04-20 → 2026-04-21)

1. **NetworkMap** literal de la topología real (71 nodos + 76 routes) portada de `mpodeley/gasoductos`.
2. **Coloreo por operador** (TGN/TGS/GPNK/Camuzzi/Export) con fallback stress por tramo.
3. **Distribuidoras**: polígonos GeoJSON + 9 burbujas con consumo real GED (dam³/mes → MMm³/d).
4. **ENARGAS monthly**: GRT + Contratos + GED integrados; JSON compactado 476→136 KB con trim 15 años.
5. **Cuenca bubbles**: 4 burbujas sobre centroides (Neuquina/NOA/San Jorge/Austral) desde GRT Cuenca.
6. **Iteración de labels del mapa**: 0.048 → 0.10 → 0.24 (5x baseline final tras feedback).

Commits del día:
- `4770773` Bump NetworkMap label fontScale to 5x baseline
- `f69f455` Map labels +2x
- `244041d` Map: smaller container, larger labels
- `b92077f` GED consumption + compact JSON + bigger map labels
- `144e78b` NetworkMap: bigger labels and nodes
- `820bb33` NetworkMap: operator groups + cuenca/distribuidora bubbles

---

## Pendientes (backlog)

### Del roadmap (`~/.claude/plans/toasty-gathering-sparkle.md`)
- **Wave 2** fuentes restantes: CAMMESA diaria de despacho (pendiente), ENARGAS stock GNL mensual, datos.gob.ar series históricas.
- **Wave 4** interactividad: date range picker, deep-linking `?date=...&city=...`, alertas configurables, export CSV/PDF.
- **Wave 5** (pospuesto) fuentes privadas TGS/TGN con credenciales.

### Inmediatos
- Chart mensual de GED por distribuidora con YoY.
- Refinar polígonos Metrogas/Naturgy BAN dentro de partidos del GBA (hoy es aproximación por lat cutoff).
- Hover sobre polígono de distribuidora mostrando su serie mensual de GED.
- `raw/incoming/` bien documentado para que el usuario dropee archivos de TGS/TGN manualmente.

---

## Referencias

- Plan estratégico: `C:\Users\mpodeley\.claude\plans\toasty-gathering-sparkle.md`
- Memory del proyecto: `C:\Users\mpodeley\.claude\projects\C--Users-mpodeley-Documents-projects-estado-red-gas\memory\`
- Repo origen topología: https://github.com/mpodeley/gasoductos
- CLAUDE.md: instrucciones específicas para futuros Claudes en este repo (ya committed).
