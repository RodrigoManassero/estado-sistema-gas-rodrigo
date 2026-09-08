# Fichas de datasets — Estado del Sistema

Cada archivo de esta carpeta documenta un dataset publicado por el tablero:
qué contiene, de qué URL oficial se descarga el crudo, qué scripts lo
procesan, dónde queda el archivo original, y cada cuánto se actualiza.

El repositorio es público: podés navegar todos los scripts desde
[`scripts/`](../../scripts/) y los datos generados desde
[`public/data/`](../../public/data/).

Cada dataset se publica como JSON (con envoltura `{generated_at, source, source_date, data}`)
y como CSV (solo la tabla, UTF-8 con BOM para que Excel lo abra limpio).

| Dataset | Contenido | CSV | JSON | Ficha |
|---|---|---|---|---|
| ENARGAS RDS | Reporte Diario del Sistema: linepack, importaciones, exportaciones, consumos por segmento | [enargas.csv](../../public/data/enargas.csv) | [enargas.json](../../public/data/enargas.json) | [enargas.md](enargas.md) |
| ENARGAS mensual | Gas recibido por cuenca/gasoducto, gas entregado por distribuidora, contratos firmes | [enargas_monthly_*.csv](../../public/data/) | [enargas_monthly.json](../../public/data/enargas_monthly.json) | [enargas_monthly.md](enargas_monthly.md) |
| CAMMESA PPO | Parte Post Operativo diario: consumo de combustibles y generación por central | [cammesa_ppo.csv](../../public/data/cammesa_ppo.csv) | [cammesa_ppo.json](../../public/data/cammesa_ppo.json) | [cammesa_ppo.md](cammesa_ppo.md) |
| CAMMESA semanal | Proyección 7 días: demanda, temperatura, inyecciones, stock | [cammesa_weekly.csv](../../public/data/cammesa_weekly.csv) | [cammesa_weekly.json](../../public/data/cammesa_weekly.json) | [cammesa_weekly.md](cammesa_weekly.md) |
| Open-Meteo BA | Forecast 14 días para Buenos Aires | [weather.csv](../../public/data/weather.csv) | [weather.json](../../public/data/weather.json) | [weather.md](weather.md) |
| Open-Meteo regiones | Forecast 14 días para 10 ciudades argentinas | [weather_regions.csv](../../public/data/weather_regions.csv) | [weather_regions.json](../../public/data/weather_regions.json) | [weather_regions.md](weather_regions.md) |
| Open-Meteo histórico | Temperatura diaria 2 años × 10 ciudades (entrenamiento del forecast) | [weather_history.csv](../../public/data/weather_history.csv) | [weather_history.json](../../public/data/weather_history.json) | [weather_history.md](weather_history.md) |
| SMN alertas | Alertas meteorológicas activas del Servicio Meteorológico Nacional | [smn_alerts.csv](../../public/data/smn_alerts.csv) | [smn_alerts.json](../../public/data/smn_alerts.json) | [smn_alerts.md](smn_alerts.md) |
| MEGSA | Benchmarks (Henry Hub/TTF/Brent/WTI), USD/ARS, rondas de negociación | [megsa_*.csv](../../public/data/) | [megsa.json](../../public/data/megsa.json) | [megsa.md](megsa.md) |
| Excel base (daily) | Histórico manual: demanda, linepack TGS/TGN, mix CAMMESA, temperaturas | [daily.csv](../../public/data/daily.csv) | [daily.json](../../public/data/daily.json) | [daily.md](daily.md) |
| Linepack equilibrio | Datos de equilibrio/desbalance TGN del Excel de linepack | [linepack.csv](../../public/data/linepack.csv) | [linepack.json](../../public/data/linepack.json) | [linepack.md](linepack.md) |
| Tramos | Restricciones de transporte (Gas Andes, CCO, TGS NQN) | [tramos.csv](../../public/data/tramos.csv) | [tramos.json](../../public/data/tramos.json) | [tramos.md](tramos.md) |
| Forecast de demanda | Pronóstico 14 días por segmento (prioritaria, usinas, industria, GNC, combustible) | [demand_forecast.csv](../../public/data/demand_forecast.csv) | [demand_forecast.json](../../public/data/demand_forecast.json) | [demand_forecast.md](demand_forecast.md) |
| Backtest forecast | Evaluación rolling out-of-sample del forecast: MAE/MAPE por segmento | [forecast_backtest.csv](../../public/data/forecast_backtest.csv) | [forecast_backtest.json](../../public/data/forecast_backtest.json) | [forecast_backtest.md](forecast_backtest.md) |
| Comentarios auto | Notas diarias/semanales generadas automáticamente a partir del forecast | [comments.csv](../../public/data/comments.csv) | [comments.json](../../public/data/comments.json) | [comments.md](comments.md) |
| Comentarios manuales | Notas tipeadas por el analista en el Excel base | [comments_manual.csv](../../public/data/comments_manual.csv) | [comments_manual.json](../../public/data/comments_manual.json) | [comments_manual.md](comments_manual.md) |

## Cómo se actualizan

Un GitHub Action (ver [`.github/workflows/update-data.yml`](../../.github/workflows/update-data.yml))
corre todos los días alrededor de las 9:00 UTC (6:00 AM Argentina):

1. Corre `scripts/build_data.py`, que ejecuta los fetchers y parsers en orden.
2. Cada script descarga su fuente, parsea lo que haya nuevo, y actualiza el JSON + CSV en `public/data/`.
3. El build de Vite empaqueta el tablero con los datos y lo publica en GitHub Pages.
4. Los JSON y CSV quedan committeados en la rama `master` — se pueden revisar en el historial de git.

Si algo falla, el pipeline sale con código ≠ 0 y el deploy no se actualiza.
Las corridas se pueden ver en la [pestaña Actions del repo](https://github.com/mpodeley/estado-red-gas/actions).
