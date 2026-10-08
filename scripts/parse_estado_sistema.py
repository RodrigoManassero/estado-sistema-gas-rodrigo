#!/usr/bin/env python3
import os
import pandas as pd
from _meta import write_json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(BASE_DIR, '..', 'data', 'raw', 'EstadoSistema.xlsx')
OUTPUT_FILE = os.path.join(BASE_DIR, '..', 'public', 'data', 'sistema_estado.json')

def parse_estado():
    if not os.path.exists(INPUT_FILE):
        # Fallback si no existe el archivo aún
        data = {"fecha": None, "tgn": "NORMAL", "tgs": "NORMAL"}
    else:
        # Se agrega header=None por si el Excel es clave-valor vertical sin cabecera
        if INPUT_FILE.endswith('.xlsx'):
            df = pd.read_excel(INPUT_FILE, header=None)
        else:
            df = pd.read_csv(INPUT_FILE, header=None)
            
        # Mapea la columna 0 como clave y la columna 1 como valor
        records = dict(zip(df.iloc[:, 0], df.iloc[:, 1]))
        
        raw_fecha = records.get('DIA', '')
        # Normaliza la fecha a string YYYY-MM-DD si es un timestamp de pandas/excel
        if pd.notna(raw_fecha):
            fecha_str = pd.to_datetime(raw_fecha).strftime('%Y-%m-%d') if not isinstance(raw_fecha, str) else raw_fecha.strip()
        else:
            fecha_str = None

        data = {
            "fecha": fecha_str,
            "tgn": str(records.get('ESTADO SISTEMA TGN', 'NORMAL')).strip(),
            "tgs": str(records.get('ESTADO SISTEMA TGS', 'NORMAL')).strip()
        }
    
    write_json(OUTPUT_FILE, data)

if __name__ == '__main__':
    parse_estado()
