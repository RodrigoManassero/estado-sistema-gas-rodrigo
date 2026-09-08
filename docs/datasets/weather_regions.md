# Open-Meteo — Forecast 10 ciudades

## Qué contiene

14 días de pronóstico de temperatura para 10 ciudades argentinas, en formato largo (una fila por ciudad × fecha):

- **ciudad_id / ciudad / region / lat / lon** — identificación de la ciudad.
- **fecha** — ISO.
- **temp_max / temp_min / temp_prom** — °C.

Ciudades cubiertas:

- Pampa: Buenos Aires, Rosario, Santa Fe, Bahía Blanca.
- Centro: Córdoba.
- Cuyo: Mendoza.
- Patagonia: Neuquén, Esquel.
- NOA: Salta, Tucumán.

Estas ciudades se eligieron para cubrir los centros de demanda prioritaria e industrial, los puntos de producción (Vaca Muerta, GNL) y las zonas de ingreso del gas del norte (Salta/Tucumán).

## De dónde viene

API pública (sin API key ni login): <https://open-meteo.com/>.

Mismo endpoint que [`weather.md`](weather.md), una llamada por ciudad.

**Frecuencia en origen**: continua.

## Cómo se procesa

1. [`scripts/fetch_weather.py`](../../scripts/fetch_weather.py) — itera las 10 ciudades, llama al endpoint de Open-Meteo con lat/lon, arma un array con `{id, label, region, lat, lon, forecast: [...]}` por ciudad, y escribe el JSON.
2. El CSV se genera aplanando a formato largo: cada fila combina la metadata de la ciudad con un día del forecast.

## Archivos generados

- JSON: [`public/data/weather_regions.json`](../../public/data/weather_regions.json) (~22 KB).
- CSV: [`public/data/weather_regions.csv`](../../public/data/weather_regions.csv).
- Crudos: no se guardan.

## Cada cuánto

Diaria.
