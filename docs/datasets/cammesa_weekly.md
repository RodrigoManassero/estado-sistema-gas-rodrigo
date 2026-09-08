# CAMMESA — Programación Semanal

## Qué contiene

Un CSV con una fila por (reporte, día) del pronóstico CAMMESA a 7 días:

- **source** — nombre del PDF (`PS_YYYYMMDD.pdf`).
- **fecha / dia / mes** — fecha del día pronosticado.
- **temperatura** — temperatura media proyectada (°C).
- **demanda_total** — demanda total proyectada (MMm³/d).
- **prioritaria / industria / usinas** — demanda por segmento (MMm³/d).
- **inyecciones** — inyecciones totales al sistema (MMm³/d).
- **stock** — stock proyectado.

Sirve para comparar el forecast oficial de CAMMESA contra nuestro forecast propio (ver `demand_forecast.json`).

## De dónde viene

Fuente oficial: <https://cammesaweb.cammesa.com/programacion-semanal/>.

Los PDFs se llaman `PS_YYYYMMDD.pdf` donde la fecha indica el lunes de la semana proyectada. El fetcher raspa la página y si no encuentra el link prueba URLs directas en `cammesaweb.cammesa.com/download/` y `portalweb.cammesa.com/download/`.

**Frecuencia en origen**: semanal (típicamente los jueves/viernes).

## Cómo se procesa

1. [`scripts/fetch_cammesa.py`](../../scripts/fetch_cammesa.py) — descarga el PDF semanal más nuevo a `raw/PS_YYYYMMDD.pdf`.
2. [`scripts/parse_cammesa.py`](../../scripts/parse_cammesa.py) — abre cada PDF con `pdfplumber`, parsea la fila de header para obtener los 7 días, y extrae fila por fila (temperatura, demanda total, prioritaria, industria, usinas, inyecciones, stock). Guarda una entrada por PDF procesado.

El JSON conserva la estructura jerárquica (list-of-reports, cada uno con `days`). El CSV aplana todo a formato largo para que se pueda filtrar por `source` o por fecha directo en Excel.

## Archivos generados

- JSON: [`public/data/cammesa_weekly.json`](../../public/data/cammesa_weekly.json).
- CSV: [`public/data/cammesa_weekly.csv`](../../public/data/cammesa_weekly.csv).
- Crudos: `raw/PS_*.pdf` (se acumulan).

## Cada cuánto

Diaria (si no hay PDF nuevo, el parser no suma filas).
