# SMN — Alertas meteorológicas

## Qué contiene

Una fila por alerta meteorológica activa del SMN (Servicio Meteorológico Nacional):

- **fecha_hora** — emisión de la alerta.
- **numero** — código del aviso.
- **zona** — región/provincia afectada.
- **fenomeno** — tipo (tormenta, viento, calor extremo, etc.).
- **situacion** — nivel (amarilla, naranja, roja).
- **descripcion** — texto libre del aviso.

El archivo está vacío cuando no hay alertas activas.

## De dónde viene

Mirror de datos abiertos del SMN:
<https://ssl.smn.gob.ar/dpd/zipopendata.php?dato=alertas>.

El sitio principal `www.smn.gob.ar/alertas` está detrás de Cloudflare y devuelve 403 a clientes HTTP planos; el mirror `ssl.smn.gob.ar/dpd` es público y devuelve un ZIP con un TXT tab-separated adentro.

**Frecuencia en origen**: continua (se actualiza cuando se emite o cierra una alerta).

## Cómo se procesa

1. [`scripts/fetch_smn_alerts.py`](../../scripts/fetch_smn_alerts.py) — descarga el ZIP, lee el TXT con encoding latin-1, y parsea cada línea partiendo por tab. Si el response no es ZIP o el ZIP está vacío, escribe una lista vacía (no falla).
2. Cada alerta se guarda como dict con las columnas estándar más un `raw` con la línea original; el CSV drop-ea `raw` porque duplica los campos.

## Archivos generados

- JSON: [`public/data/smn_alerts.json`](../../public/data/smn_alerts.json).
- CSV: [`public/data/smn_alerts.csv`](../../public/data/smn_alerts.csv).
- Crudos: no se guardan.

## Cada cuánto

Diaria.
