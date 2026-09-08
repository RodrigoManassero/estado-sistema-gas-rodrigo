# Open-Meteo — Forecast Buenos Aires

## Qué contiene

14 días de pronóstico de temperatura para Buenos Aires, una fila por fecha:

- **fecha** — ISO YYYY-MM-DD.
- **temp_max** — temperatura máxima proyectada (°C).
- **temp_min** — temperatura mínima proyectada (°C).
- **temp_prom** — promedio simple de max/min (°C).

Este archivo se mantiene solo para retro-compatibilidad con charts viejos; para análisis nuevo preferir [weather_regions](weather_regions.md) que cubre 10 ciudades.

## De dónde viene

API pública (sin API key ni login): <https://open-meteo.com/>.

Endpoint exacto:
```
https://api.open-meteo.com/v1/forecast
  ?latitude=-34.6037&longitude=-58.3816
  &daily=temperature_2m_max,temperature_2m_min
  &timezone=America/Argentina/Buenos_Aires
  &forecast_days=14
```

**Frecuencia en origen**: continua (Open-Meteo actualiza cada hora).

## Cómo se procesa

1. [`scripts/fetch_weather.py`](../../scripts/fetch_weather.py) — consulta Open-Meteo para las 10 ciudades definidas, escribe `weather_regions.json` con todas, y además escribe `weather.json` solo con Buenos Aires para que los componentes legacy no rompan.
2. El JSON tiene forma `{forecast: [{fecha, temp_max, temp_min, temp_prom}, ...]}`. El CSV es solo el array.

## Archivos generados

- JSON: [`public/data/weather.json`](../../public/data/weather.json) (~2 KB).
- CSV: [`public/data/weather.csv`](../../public/data/weather.csv).
- Crudos: no se guardan.

## Cada cuánto

Diaria.
