# Forecast de demanda

## Qué contiene

14 días de pronóstico de demanda de gas, una fila por día:

- **fecha** — ISO.
- **temp_prom / temp_max / temp_min** — temperatura proyectada en Buenos Aires (°C).
- **prioritaria_est / usinas_est / industria_est / gnc_est / combustible_est** — pronóstico por segmento (MMm³/d).
- **exportaciones_est** — estimado constante basado en media histórica.
- **demanda_total_est** — suma de segmentos + exportaciones.

El JSON trae además la sección `regression` con los coeficientes, R², MAE, offsets por día de la semana, etc. — la ficha del [backtest](forecast_backtest.md) explica cómo se evalúan.

## De dónde viene

No hay fuente externa — este dataset se genera entrenando modelos sobre los datos ya ingestados:

- [`enargas.json`](enargas.md) — target (demanda histórica por segmento).
- [`weather_history.json`](weather_history.md) — feature de entrenamiento (temperatura histórica).
- [`weather_regions.json`](weather_regions.md) — feature de predicción (temperatura futura).

## Cómo se procesa

[`scripts/generate_forecast.py`](../../scripts/generate_forecast.py) — entrena un modelo por segmento:

- **Prioritaria**: regresión lineal sobre HDD(18°C) calculado con la media simple de 10 ciudades. Agrega un offset residual por día de la semana.
- **Usinas (CAMMESA)**: regresión sobre temp BA cruda (CDD no mejoró en shoulder seasons).
- **Industria / GNC / Combustible**: regresión sobre temp BA. R² bajo pero medias estables.
- **Demanda total**: se prueba reconstrucción (suma de segmentos) vs regresión directa sobre `consumo_total_estimado`; se usa la de mayor R² con DOW.

Las decisiones de features son **medidas**, no especulativas. Ver el CLAUDE.md del repo y la ficha de [backtest](forecast_backtest.md) para los números.

El forecast se aplica usando el promedio de 10 ciudades para prioritaria (donde el modelo fue entrenado así) y temp BA para el resto.

## Archivos generados

- JSON: [`public/data/demand_forecast.json`](../../public/data/demand_forecast.json).
- CSV: [`public/data/demand_forecast.csv`](../../public/data/demand_forecast.csv) — solo el array `forecast`. La sección `regression` queda solo en el JSON.
- Crudos: no aplica (se entrena en memoria sobre los JSONs ya ingestados).

## Cada cuánto

Diaria — después de que corren los fetchers de ENARGAS y Open-Meteo.
