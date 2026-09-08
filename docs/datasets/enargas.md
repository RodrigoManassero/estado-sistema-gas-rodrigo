# ENARGAS — Reporte Diario del Sistema (RDS)

## Qué contiene

Una fila por día con el estado del sistema de gas argentino según ENARGAS:

- **linepack_total / linepack_delta**: gas almacenado en gasoductos y su variación (MMm³).
- **consumo_total_estimado**: consumo total del día (MMm³/d).
- **temp_min_ba / temp_max_ba / temp_tm_ba**: temperaturas de Buenos Aires.
- **imp_bolivia / imp_chile / imp_escobar / imp_bahia_blanca**: importaciones por punto (MMm³/d).
- **imp_escobar_proximo_barco / imp_bahia_blanca_proximo_barco**: fecha del próximo buque de GNL.
- **cons_prioritaria / cons_cammesa / cons_industria / cons_gnc / cons_combustible**: consumo estimado por segmento (MMm³/d).
- **exp_tgn / exp_tgs**: exportaciones por sistema de transporte (MMm³/d).

El JSON conserva más campos (comparaciones vs año anterior, forecast 6 días de temperatura de BA); el CSV trae los que se usan en el dashboard.

## De dónde viene

Fuente oficial: <https://www.enargas.gob.ar/secciones/transporte-y-distribucion/dod-reporte-diario-sistema.php>.

El endpoint de descarga directa sigue el patrón
`https://www.enargas.gob.ar/secciones/transporte-y-distribucion/descarga.php?path=reporte-diario-sistema&file=RDS_YYYYMMDD.pdf`.
Aunque la página pública solo lista los últimos 5 días, los PDFs históricos siguen accesibles por fecha.

**Frecuencia en origen**: diaria (ENARGAS publica el RDS cada día hábil).

## Cómo se procesa

1. [`scripts/fetch_enargas.py`](../../scripts/fetch_enargas.py) — raspa la página, detecta los 5 RDS más recientes y los descarga a `raw/RDS_YYYYMMDD.pdf`.
2. [`scripts/parse_enargas.py`](../../scripts/parse_enargas.py) — abre cada PDF con `pdfplumber`, extrae línea por línea los campos (regex sobre la tabla de importaciones, consumos, exportaciones, temperatura). Hace upsert por fecha en el JSON existente, así que los backfills históricos no se pierden.
3. [`scripts/backfill_enargas.py`](../../scripts/backfill_enargas.py) (one-shot) — walks back N días y reutiliza `extract_rds()` de parse_enargas para traer histórico de hasta 2 años. Los PDFs no se guardan (~150 MB para 365 días); se procesan en memoria y se descartan.

El flattener para CSV vive en `parse_enargas.flatten_for_csv()` y lo usan tanto el parser diario como el backfill.

## Archivos generados

- JSON: [`public/data/enargas.json`](../../public/data/enargas.json) (~700 KB, ~730 filas).
- CSV: [`public/data/enargas.csv`](../../public/data/enargas.csv).
- Crudos: `raw/RDS_YYYYMMDD.pdf` (se mantienen los últimos ~5 días; el histórico se descarta).

## Cada cuánto

Diaria, corre en el workflow `.github/workflows/update-data.yml` alrededor de las 9:00 UTC.
