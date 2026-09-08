# Tramos — Restricciones de transporte

## Qué contiene

Una fila por día con las restricciones de capacidad de transporte que maneja el dispatch:

- **fecha** — ISO.
- **gas_andes_autorizacion** — capacidad autorizada de exportación por Gas Andes (MMm³/d).
- **cco_capacidad / cco_corte** — capacidad del gasoducto Centro Oeste y corte (negativo = reducción vs capacidad).
- **tgs_nqn_capacidad / tgs_nqn_corte** — lo mismo para TGS Neuquén.

## De dónde viene

Lo mantiene el analista en la hoja "Datos" del Excel `Base Reporte Estado de Sistema.xlsx`, columnas 82-86. No hay fuente automática pública con esta granularidad.

**Frecuencia en origen**: manual, típicamente diaria cuando hay cambios.

## Cómo se procesa

1. [`scripts/parse_base_excel.py`](../../scripts/parse_base_excel.py) — función `parse_tramos()` lee la hoja "Datos" desde fila 6, extrae las columnas 82-86, y filtra filas completamente vacías.

Es el mismo script que genera [`daily.json`](daily.md) y [`comments_manual.json`](comments_manual.md) — todo sale del mismo Excel base.

## Archivos generados

- JSON: [`public/data/tramos.json`](../../public/data/tramos.json).
- CSV: [`public/data/tramos.csv`](../../public/data/tramos.csv).
- Crudo: `raw/Base Reporte Estado de Sistema.xlsx` (misma hoja que daily, distinta sheet interna).

## Cada cuánto

Manual.
