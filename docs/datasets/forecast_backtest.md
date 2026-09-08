# Backtest del forecast

## Qué contiene

Evaluación rolling out-of-sample del forecast. Para cada día D de los últimos 60, el modelo se reentrena sobre los 365 días anteriores a D y se evalúa prediciendo D con su temperatura real. Esto aísla la skill del modelo del error del forecast meteorológico.

Una fila por (segmento, fecha):

- **segmento** — `prioritaria`, `usinas` o `demanda_total`.
- **fecha** — día evaluado.
- **actual** — demanda observada ese día (MMm³/d).
- **predicted** — predicción del modelo entrenado sobre los 365 días previos.
- **residual** — actual − predicted.

El JSON trae además métricas agregadas por segmento: MAE, MAPE y cantidad de puntos usados.

## De dónde viene

No hay fuente externa; se calcula sobre [`enargas.json`](enargas.md) y [`weather_history.json`](weather_history.md).

## Cómo se procesa

[`scripts/backtest_forecast.py`](../../scripts/backtest_forecast.py):

1. Ordena las filas RDS por fecha.
2. Toma los últimos N días como "test set" (default 60).
3. Para cada día test:
   - Ventana de entrenamiento: 365 días estrictamente anteriores.
   - Fitea slope/intercept con OLS + offsets por día de la semana.
   - Predice el día usando la temperatura observada.
4. Calcula MAE/MAPE por segmento sobre todo el test set.

Las features (HDD para prioritaria, temp cruda para usinas/total, multi-ciudad para prioritaria) se mantienen **exactamente iguales** que `generate_forecast.py` — si se cambia una, cambiar la otra o el backtest deja de reflejar el modelo que está en producción.

## Archivos generados

- JSON: [`public/data/forecast_backtest.json`](../../public/data/forecast_backtest.json).
- CSV: [`public/data/forecast_backtest.csv`](../../public/data/forecast_backtest.csv) — formato largo (una fila por segmento × fecha), con columna `residual` pre-calculada para comparar rápido en Excel.

## Cada cuánto

Diaria. Los cambios en el backtest típicamente se notan día a día cuando hay eventos meteorológicos fuertes.
