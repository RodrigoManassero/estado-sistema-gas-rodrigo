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
        df = pd.read_excel(INPUT_FILE) if INPUT_FILE.endswith('.xlsx') else pd.read_csv(INPUT_FILE)
        # Transforma clave-valor
        records = dict(zip(df.iloc[:, 0], df.iloc[:, 1]))
        data = {
            "fecha": str(records.get('DIA', '')),
            "tgn": str(records.get('ESTADO SISTEMA TGN', 'NORMAL')),
            "tgs": str(records.get('ESTADO SISTEMA TGS', 'NORMAL'))
        }
    
    write_json(OUTPUT_FILE, data)

if __name__ == '__main__':
    parse_estado()
