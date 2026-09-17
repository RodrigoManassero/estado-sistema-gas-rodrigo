#!/usr/bin/env python3

import json
import os
import sys
from datetime import datetime
from openpyxl import load_workbook

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_FILE = os.path.join(BASE_DIR, "..", "raw", "info_weekly.xlsx")
OUT_FILE = os.path.join(BASE_DIR, "..", "public", "data", "cammesa_weekly.json")


def parse_fecha(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    
    val_str = str(val).strip().split(' ')[0].split('T')[0]
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(val_str, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return val_str[:10] if len(val_str) >= 10 else val_str


def main():
    print(f"Buscando archivo en: {RAW_FILE}", flush=True)

    if not os.path.exists(RAW_FILE):
        print(f"ERROR: No se encontró el archivo {RAW_FILE} en el repositorio.", flush=True)
        # Finaliza de forma limpia sin romper todo el job pero registrando el fallo
        sys.exit(1)

    try:
        wb = load_workbook(RAW_FILE, data_only=True)
        ws = wb.active

        headers = []
        for col in range(2, ws.max_column + 1):
            val = ws.cell(row=1, column=col).value
            fecha_iso = parse_fecha(val)
            if fecha_iso:
                headers.append(fecha_iso)

        combustibles = {}
        for row in range(2, ws.max_row + 1):
            nombre = ws.cell(row=row, column=1).value
            if not nombre:
                continue
            key = str(nombre).strip()
            combustibles[key] = [
                float(ws.cell(row=row, column=col).value or 0)
                for col in range(2, ws.max_column + 1)
            ]

        rows = []
        for i, fecha in enumerate(headers):
            rows.append({
                "fecha": fecha,
                "gas_dam3": combustibles.get("Gas", [0] * len(headers))[i],
                "go": combustibles.get("Dies_Oil", [0] * len(headers))[i],
                "fo": combustibles.get("Fuel_Oil", [0] * len(headers))[i],
                "cm": combustibles.get("Carbon", [0] * len(headers))[i],
                "source": "weekly"
            })

        os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
        with open(OUT_FILE, "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2, ensure_ascii=False)

        print(f"ÉXITO: cammesa_weekly.json generado con {len(rows)} filas (hasta {headers[-1] if headers else 'N/A'}).", flush=True)

    except Exception as e:
        print(f"EXCEPCIÓN al procesar el Excel: {e}", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
