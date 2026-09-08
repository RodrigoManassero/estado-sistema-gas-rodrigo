# Comentarios manuales (Excel base)

## Qué contiene

Notas tipeadas por el analista en las hojas "Diario" y "Proyección Semanal" del Excel `Base Reporte Estado de Sistema.xlsx`. Una fila por comentario:

- **tipo** — `daily` o `weekly`.
- **texto** — texto libre, tal como lo escribió el analista.

El parser toma cualquier string con más de 20 caracteres en esas hojas, asumiendo que son notas y no labels/headers.

## De dónde viene

Manual — el analista edita el Excel base.

## Cómo se procesa

[`scripts/parse_base_excel.py`](../../scripts/parse_base_excel.py) — función `parse_comments()`. Itera cada celda de las hojas "Diario" y "Proyección Semanal", se queda con strings >20 chars y los apila.

## Archivos generados

- JSON: [`public/data/comments_manual.json`](../../public/data/comments_manual.json).
- CSV: [`public/data/comments_manual.csv`](../../public/data/comments_manual.csv).
- Crudo: `raw/Base Reporte Estado de Sistema.xlsx` (mismo que `daily.json`).

## Cada cuánto

Manual. Se reprocesan en cada corrida del pipeline.

## Nota

Los comentarios auto en [comments.json](comments.md) tienen prioridad en la UI (se muestran arriba); los manuales se pueden surfacear en una sección separada si hace falta.
