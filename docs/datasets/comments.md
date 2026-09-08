# Comentarios automáticos

## Qué contiene

Notas generadas automáticamente sobre el estado del día y la semana siguiente. Una fila por comentario:

- **tipo** — `daily` (snapshot del día) o `weekly` (pronóstico 7d).
- **texto** — string listo para mostrar.

El JSON trae además un campo `note` con el timestamp del último update.

Ejemplos:

- "Temperatura promedio en Buenos Aires: 14 C (min 8, max 20)."
- "Linepack TGS: 412.5 MMm³, variación -1.2 - Estado: NORMAL (límites: 400-430)."
- "Demanda total estimada para la semana: 112-118 MMm³/día."

## De dónde viene

Se construyen a partir de los datos ingestados el mismo día:

- [`daily.json`](daily.md) — últimas filas (demanda, linepack, mix CAMMESA).
- [`demand_forecast.json`](demand_forecast.md) — primeros 7 días del forecast.

## Cómo se procesa

[`scripts/generate_forecast.py`](../../scripts/generate_forecast.py) — función `generate_comments()`. Arma textos con templates simples y los guarda.

## Archivos generados

- JSON: [`public/data/comments.json`](../../public/data/comments.json).
- CSV: [`public/data/comments.csv`](../../public/data/comments.csv).

## Cada cuánto

Diaria.

## Nota

Estos comentarios **auto** son independientes de los [comentarios manuales](comments_manual.md) que viene el analista tipea en el Excel.
