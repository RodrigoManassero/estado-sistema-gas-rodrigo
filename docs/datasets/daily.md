# Excel base — Daily

## Qué contiene

Una fila por día con el estado del sistema tal como lo mantenía el analista en el Excel `Base Reporte Estado de Sistema.xlsx`. Columnas principales:

- **fecha** — ISO.
- **demanda_total / prioritaria / industria / usinas / exportaciones** — demanda por segmento (MMm³/d).
- **iny_tgs / iny_tgn / iny_enarsa / iny_gpm / iny_bolivia / iny_escobar / iny_total** — inyecciones por punto (MMm³/d).
- **linepack_tgs / linepack_tgn / linepack_total** + var + límites — linepack por sistema y totales.
- **tramo_final_tgs / tramo_final_tgn** + límites — presiones en tramo final.
- **temp_min_ba / temp_max_ba / temp_prom_ba**, `esquel` equivalent.
- **cammesa_gas / cammesa_gasoil / cammesa_fueloil / cammesa_carbon / cammesa_total** — mix CAMMESA (fuente legacy; ahora el PPO oficial cubre esto mejor).

Este dataset está **en vías de reemplazo** por las fuentes automáticas (ENARGAS RDS cubre linepack + consumos + importaciones; CAMMESA PPO cubre el fuel mix). Se mantiene porque tiene historia anterior a los fetchers automáticos.

## De dónde viene

Manual — analista actualiza el Excel `Base Reporte Estado de Sistema.xlsx` y lo dropea en `raw/` o en `raw/incoming/`.

**Frecuencia en origen**: manual, típicamente diaria.

## Cómo se procesa

1. [`scripts/ingest_incoming.py`](../../scripts/ingest_incoming.py) (opcional) — si el archivo se dropeó en `raw/incoming/`, lo detecta por magic bytes (`PK\x03\x04` = XLSX) y lo mueve a `raw/`. Archiva copia con timestamp en `raw/incoming/_archive/`.
2. [`scripts/parse_base_excel.py`](../../scripts/parse_base_excel.py) — abre el XLSX con `openpyxl`, valida los headers contra un schema fijo (`SCHEMA` al principio del archivo), y extrae fila por fila la hoja "Conv. valores". Si un header crítico (fecha, demanda_total, linepack_tgs, linepack_tgn) no matchea, aborta. Headers no críticos que cambien se reportan como warnings pero no paran el pipeline.

Usa el mismo parser para `tramos.json` (hoja "Datos", cols 82-86) y `comments_manual.json` (hojas "Diario" y "Proyección Semanal"). Ver sus fichas respectivas.

## Archivos generados

- JSON: [`public/data/daily.json`](../../public/data/daily.json).
- CSV: [`public/data/daily.csv`](../../public/data/daily.csv).
- Crudo: `raw/Base Reporte Estado de Sistema.xlsx`.

## Cada cuánto

Manual — el pipeline lo reprocesa en cada corrida, pero solo hay datos nuevos si el analista dropeó un archivo actualizado.
