# Linepack equilibrium (Excel)

## Qué contiene

Datos complementarios de equilibrio/desbalance del sistema TGN que vienen en un Excel aparte (`gasoductoLinepackEq.xlsx` o similar). Las columnas dependen del Excel específico; el parser toma lo que encuentre en la primera hoja con headers en la fila 1.

Este dataset es auxiliar al [`enargas.json`](enargas.md), que ya trae el linepack total del sistema. Se mantiene por si el analista necesita sub-indicadores específicos de TGN.

## De dónde viene

Manual — analista dropea el archivo en `raw/` o `raw/incoming/`.

**Frecuencia en origen**: manual.

## Cómo se procesa

1. [`scripts/parse_linepack.py`](../../scripts/parse_linepack.py) — busca en `raw/` cualquier `.xlsx` que tenga "linepack" en el nombre. Abre la primera hoja con `openpyxl`, usa la fila 1 como headers (normaliza a snake_case) y extrae fila por fila.

Si no hay archivo en `raw/`, el script imprime "No linepack Excel found, skipping." y no genera JSON/CSV — el dataset queda con los datos de la corrida anterior.

## Archivos generados

- JSON: [`public/data/linepack.json`](../../public/data/linepack.json).
- CSV: [`public/data/linepack.csv`](../../public/data/linepack.csv).
- Crudo: `raw/*linepack*.xlsx`.

## Cada cuánto

Manual.
