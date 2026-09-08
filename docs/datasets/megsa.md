# MEGSA — Benchmarks + USD + Rondas

## Qué contiene

Datos del Mercado Electrónico del Gas de Argentina (MEGSA). Los precios spot domésticos están detrás del agent portal (autenticado); lo que se publica en la API pública son los contextos que siguen los analistas:

- **`megsa_benchmarks.csv`** — benchmarks internacionales: Natural Gas (Henry Hub), TTF, Brent, WTI. Una fila por producto con precio actual, variación, fecha.
- **`megsa_fx.csv`** — una fila con USD/ARS oficial y su variación.
- **`megsa_rondas.csv`** — calendario de rondas publicadas (ID, descripción, fecha publicación, última modificación).

## De dónde viene

API pública: <https://www.megsa.ar/api/>.

Endpoints usados:

- `GET /api/hidrocarburos` — benchmarks.
- `GET /api/dolar` — USD/ARS.
- `GET /api/rondas/publicadas` — rondas.

**Frecuencia en origen**: continua durante el horario de mercado; los benchmarks se refrescan con feed externo.

## Cómo se procesa

1. [`scripts/fetch_megsa.py`](../../scripts/fetch_megsa.py) — consulta los tres endpoints, normaliza los shapes (el `dolar` viene como `{data: [...]}` y se toma el primer elemento), ordena las rondas por fecha descendente, y escribe un único JSON con `{benchmarks, dolar, rondas, fetched_at}`.
2. El JSON tiene 3 tablas de shape distinta, así que el CSV se divide en 3 archivos (uno por tabla).

## Archivos generados

- JSON: [`public/data/megsa.json`](../../public/data/megsa.json).
- CSVs:
  - [`megsa_benchmarks.csv`](../../public/data/megsa_benchmarks.csv)
  - [`megsa_fx.csv`](../../public/data/megsa_fx.csv)
  - [`megsa_rondas.csv`](../../public/data/megsa_rondas.csv)
- Crudos: no se guardan.

## Cada cuánto

Diaria.

## Nota sobre el spot doméstico

`negociacion.megsa.ar` requiere login de agente habilitado y no se puede automatizar con credenciales genéricas. Por ahora queda fuera del scope — si el spot doméstico se vuelve imprescindible, un usuario autorizado puede dropear el export semanal en `raw/incoming/` para ingesta manual.
