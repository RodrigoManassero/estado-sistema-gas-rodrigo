# Open-Meteo — Histórico 2 años, 10 ciudades

## Qué contiene

2 años de temperatura diaria para las mismas 10 ciudades que `weather_regions` (Buenos Aires, Rosario, Córdoba, Santa Fe, Mendoza, Neuquén, Bahía Blanca, Esquel, Salta, Tucumán), en formato largo:

- **ciudad_id / ciudad / region / lat / lon** — identificación.
- **fecha** — ISO.
- **temp_max / temp_min / temp_prom** — °C.

Total: ~7.300 filas (≈730 días × 10 ciudades).

Este dataset es el insumo de entrenamiento del forecast de demanda: el modelo de prioritaria usa la media simple de las 10 ciudades en vez de solo BA, lo que mejoró el R² de 0.82 a 0.89 en backtest.

## De dónde viene

API pública: <https://archive-api.open-meteo.com/v1/archive>.

Endpoint:
```
https://archive-api.open-meteo.com/v1/archive
  ?latitude=...&longitude=...
  &start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
  &daily=temperature_2m_max,temperature_2m_min
  &timezone=America/Argentina/Buenos_Aires
```

El archive trails la realidad por ~5 días, así que siempre pedimos hasta hoy-7d para no bajar datos incompletos.

**Frecuencia en origen**: continua (en la práctica ~diaria).

## Cómo se procesa

1. [`scripts/fetch_weather_history.py`](../../scripts/fetch_weather_history.py) — reusa la lista `CITIES` de `fetch_weather.py`, llama al endpoint de archive para cada una con ventana de 2 años, arma `{id, label, region, lat, lon, history: [...]}` por ciudad.
2. El CSV se genera aplanando a formato largo. El JSON es ~1.1 MB; el CSV es similar en tamaño pero más fácil de procesar en Excel filtrando por `ciudad_id`.

## Archivos generados

- JSON: [`public/data/weather_history.json`](../../public/data/weather_history.json) (~1.1 MB).
- CSV: [`public/data/weather_history.csv`](../../public/data/weather_history.csv).
- Crudos: no se guardan.

## Cada cuánto

Diaria en el workflow, aunque el archive agrega ~1 día por corrida.
