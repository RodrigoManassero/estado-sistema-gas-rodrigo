# raw/incoming/

Dropeá acá archivos que querés que el pipeline ingiera.

## Qué reconoce

| Patrón | Destino en raw/ | Parser |
|---|---|---|
| `ETGS*.pdf` | `ETGS*.pdf` | `parse_enargas.py` |
| `PS_YYYYMMDD.pdf` | `PS_YYYYMMDD.pdf` | `parse_cammesa.py` |
| `*linepack*.xlsx` | `*linepack*.xlsx` | `parse_linepack.py` |
| `Base Reporte*.xlsx` | `Base Reporte Estado de Sistema.xlsx` (sobreescribe) | `parse_base_excel.py` |
| Otro `.pdf` / `.xlsx` válido | se guarda pero sin parser automático | — |
| Cualquier otro archivo | se deja en incoming/ y se avisa | — |

## Cuándo se procesa

- Cuando corrés `python scripts/build_data.py` manualmente
- En cada corrida de GitHub Actions (cron diario 6 AM ARG)

## Qué pasa después

Los archivos reconocidos se mueven a `raw/` con el nombre esperado. Una copia timestamp-eada queda en `raw/incoming/_archive/<UTC>__<filename>` para auditoría.

Los archivos no reconocidos quedan acá y el pipeline emite un warning — no bloquea el resto del build.
