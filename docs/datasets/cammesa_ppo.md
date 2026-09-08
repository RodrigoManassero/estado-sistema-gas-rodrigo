# CAMMESA — Parte Post Operativo (PPO)

## Qué contiene

Una fila por día con el consumo agregado de combustibles y la generación neta de todas las centrales térmicas del MEM (Mercado Eléctrico Mayorista):

- **fecha** — día operativo (ISO).
- **gas_mmm3** — consumo de gas natural (MMm³/d, convertido desde dam³ oficial).
- **carbon_tn** — consumo de carbón (Tn).
- **fueloil_tn** — consumo de fuel oil (Tn).
- **gasoil_m3** — consumo de gasoil (m³).
- **gen_gas_mwh / gen_carbon_mwh / gen_fueloil_mwh / gen_gasoil_mwh** — energía neta generada por cada combustible (MWh).
- **plants_counted** — cantidad de plantas agregadas para ese día (sanity check).

Este dataset reemplaza el fuel-mix que antes venía del Excel manual.

## De dónde viene

Fuente oficial: <https://cammesaweb.cammesa.com/reportes-resultados-de-operaciones/>.

API pública reverse-engineered desde el SPA de CAMMESA:

- **Listado**: `GET https://api.cammesa.com/pub-svc/public/findDocumentosByNemoRango?nemo=INFORME_OPERATIVO&fechadesde=...&fechahasta=...`
- **Descarga**: `GET https://api.cammesa.com/pub-svc/public/findAttachmentByNemoId?nemo=INFORME_OPERATIVO&docId=...&attachmentId=...`

Los archivos descargados son `.xls` (OLE2) "encriptados" con el password default de Excel read-only `VelvetSweatshop`. No es autenticación real — cualquier Excel los abre sin preguntar. El script decripta en memoria con `msoffcrypto-tool` y parsea con `xlrd`.

**Frecuencia en origen**: diaria (típicamente publicado al día siguiente).

## Cómo se procesa

1. [`scripts/fetch_cammesa_ppo.py`](../../scripts/fetch_cammesa_ppo.py) — lista documentos en el rango indicado, descarga los que no tenemos (upsert por fecha), decripta, parsea la hoja `Consumo Combustibles`, suma todas las centrales, y upserta en `cammesa_ppo.json`.
2. Detalles de agregación:
   - Columnas: B=código planta, C=consumo gas (dam³), D=gen gas (MWh), F=consumo carbón, G=gen carbón, I=consumo fueloil, J=gen fueloil, L=consumo gasoil, M=gen gasoil.
   - Datos desde fila 4 hasta la última con código de planta; filas "Total..." se saltan.
   - Gas: dam³ → MMm³ (÷1000).

El pipeline diario corre con ventana corta (30 días); para backfill mayor se corre a mano con `--days 365 --force`.

## Archivos generados

- JSON: [`public/data/cammesa_ppo.json`](../../public/data/cammesa_ppo.json) (~30 KB).
- CSV: [`public/data/cammesa_ppo.csv`](../../public/data/cammesa_ppo.csv).
- Crudos: no se guardan — se descargan a memoria y se descartan tras parsear.

## Cada cuánto

Diaria en el workflow. Backfill manual cuando hace falta.

## Nota de acceso

El agent portal `negociacion.megsa.ar` da acceso a precios spot domésticos que quedan fuera del PPO público; por ahora esos datos no se ingestan.
