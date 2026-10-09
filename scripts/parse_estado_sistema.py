#!/usr/bin/env python3
import json
import os
import sys
import traceback
from datetime import datetime, timezone
import pandas as pd

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW_FILE = os.path.join(BASE_DIR, "raw", "EstadoSistema.xlsx")
OUT_FILE = os.path.join(BASE_DIR, "public", "data", "sistema_estado.json")


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
    try:
        print(f"=== DIAGNÓSTICO EN NUBE ===", flush=True)
        print(f"Ruta RAW_FILE: {RAW_FILE}", flush=True)
        print(f"¿El archivo existe?: {os.path.exists(RAW_FILE)}", flush=True)
        if os.path.exists(RAW_FILE):
            print(f"Tamaño del archivo en bytes: {os.path.getsize(RAW_FILE)}", flush=True)

        if not os.path.exists(RAW_FILE):
            raise FileNotFoundError(f"No se encontró el archivo en {RAW_FILE}")

        # Intentar leer el Excel
        df = pd.read_excel(RAW_FILE, header=None)
        records = dict(zip(df.iloc[:, 0], df.iloc[:, 1]))
        
        raw_fecha = records.get('DIA', '')
        fecha_str = parse_fecha(raw_fecha) if pd.notna(raw_fecha) else None

        inner_data = {
            "fecha": fecha_str,
            "tgn": str(records.get('ESTADO SISTEMA TGN', 'NORMAL')).strip().upper(),
            "tgs": str(records.get('ESTADO SISTEMA TGS', 'NORMAL')).strip().upper()
        }

        envelope = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "EstadoSistema.xlsx",
            "source_date": inner_data.get("fecha"),
            "data": inner_data
        }

        os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
        with open(OUT_FILE, "w", encoding="utf-8") as f:
            json.dump(envelope, f, indent=2, ensure_ascii=False)

        print(f"ÉXITO: JSON generado correctamente.", flush=True)

    except Exception as e:
        print(f"\n[ERROR CRÍTICO CAPTURADO]", flush=True)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
