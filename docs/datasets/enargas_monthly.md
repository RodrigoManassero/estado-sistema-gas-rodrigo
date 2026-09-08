# ENARGAS — Estadísticas mensuales

## Qué contiene

Tres series mensuales en un mismo JSON, separadas en CSVs para navegar más fácil en Excel:

- **`enargas_monthly_cuenca.csv`** — Gas recibido por transportista por cuenca (TGN/TGS × Neuquina/Noroeste/etc.). Units: dam³/mes.
- **`enargas_monthly_gasoducto.csv`** — Gas recibido por gasoducto (Centro Oeste, Norte, Neuba I+II, Gral San Martín, Malargüe, Sur…). Units: dam³/mes.
- **`enargas_monthly_contratos.csv`** — Contratos de transporte firme por licenciataria (columnas variables según el sheet oficial).
- **`enargas_monthly_entregado.csv`** — Gas entregado agregado por distribuidora (Metrogas, Naturgy BAN, Centro, Cuyana, GasNea, Litoral, Gasnor, Pampeana, Sur). Units: dam³ de 9300 kcal/mes, últimos 60 meses.

Para convertir a MMm³/d: `dam³/mes × 1000 / días_del_mes / 1e6`.

## De dónde viene

Fuente oficial: <https://www.enargas.gob.ar/secciones/transporte-y-distribucion/datos-operativos.php>
(pestaña "Datos Estadísticos").

Endpoint de descarga directa: `https://www.enargas.gob.ar/secciones/transporte-y-distribucion/datos-estadisticos/<CODE>/<FILE>.xlsx`.

Archivos que se bajan:

- `GRT/GRT.xlsx` — Gas Recibido por Transportista (hojas Cuenca, Gasoducto).
- `GED/GED.xlsx` — Gas Entregado por Distribuidora (hoja STS2).
- `Contratos/Contratos.xlsx` — Contratos firmes de transporte.

Requiere header `Referer: https://www.enargas.gob.ar/...datos-operativos.php`; sin ese header el server devuelve 404.

**Frecuencia en origen**: mensual (se actualiza con ~30 días de rezago).

## Cómo se procesa

1. [`scripts/fetch_enargas_estadisticas.py`](../../scripts/fetch_enargas_estadisticas.py) — descarga los tres XLSX en memoria, los parsea con `openpyxl` (hoja por hoja, header-driven), y guarda todo en un solo JSON.
2. Los datos se recortan: últimos 180 meses (15 años) para cuenca/gasoducto/contratos, últimos 60 meses para entregado. Esto mantiene el archivo en ~140 KB.

El JSON tiene forma `{gas_recibido: {cuenca, gasoducto}, contratos_firme, gas_entregado}`. El CSV se divide en 4 archivos, uno por serie.

## Archivos generados

- JSON: [`public/data/enargas_monthly.json`](../../public/data/enargas_monthly.json) (~140 KB).
- CSVs:
  - [`enargas_monthly_cuenca.csv`](../../public/data/enargas_monthly_cuenca.csv)
  - [`enargas_monthly_gasoducto.csv`](../../public/data/enargas_monthly_gasoducto.csv)
  - [`enargas_monthly_contratos.csv`](../../public/data/enargas_monthly_contratos.csv)
  - [`enargas_monthly_entregado.csv`](../../public/data/enargas_monthly_entregado.csv)
- Crudos: no se guardan (se procesan en memoria).

## Cada cuánto

Diaria en el workflow. Si el sitio de ENARGAS no publicó un mes nuevo, el parser simplemente no agrega filas.
