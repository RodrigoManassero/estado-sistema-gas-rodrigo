#!/usr/bin/env python3
"""Parse CCO Word minutas (.docx) from raw/ and generate public/data/mantenimientos.json."""

import json
import os
import re
import sys
from datetime import datetime
import docx

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
OUT_JSON = os.path.join(OUT_DIR, 'mantenimientos.json')


def clean_text(text: str) -> str:
    return ' '.join(text.split())


def parse_cco_docx(file_path: str) -> list[dict]:
    doc = docx.Document(file_path)
    records = []
    
    current_cuenca = "General"
    current_empresa = "General"
    current_instalacion = ""
    
    # Expresiones regulares útiles para extraer impacto y fechas
    impact_pattern = re.compile(r'(?:impacto|afectación|impacto potencial)[:\s]*([-\d,\.]+)\s*MM', re.IGNORECASE)
    date_pattern = re.compile(r'(\d{1,2}/\d{1,2}(?:/\d{2,4})?|\b(?:Octubre|Noviembre|Diciembre|Marzo)\b)', re.IGNORECASE)

    # 1. Procesar Párrafos
    for p in doc.paragraphs:
        text = clean_text(p.text)
        if not text:
            continue
            
        # Detectar Cuencas o Secciones Principales
        if "Cuenca" in text or "Tramos Finales" in text:
            current_cuenca = text
            current_empresa = "General"
            continue
            
        # Detectar Empresas principales
        empresas_conocidas = ["TGS", "TGN", "YPF", "PAE", "TECPETROL", "TOTAL", "CAMMESA", "MEGA", "GPM", "CGC", "ROCH", "VISTA", "CAPEX", "ENARSA", "ENARGAS"]
        if text.upper() in empresas_conocidas or any(text.upper().startswith(e) for e in ['TGS ', 'TGN ', 'YPF ']):
            current_empresa = text.split()[0]
            continue
            
        # Si tiene pinta de mantenimiento u obra
        if any(kw in text.lower() for kw in ['obra:', 'tarea:', 'cambio de', 'reparación', 'prueba', 'corrida', 'paro', 'mantenimiento']):
            records.append({
                "cuenca_zona": current_cuenca,
                "empresa": current_empresa,
                "instalacion": current_instalacion or current_empresa,
                "obra_tarea": text,
                "fecha_texto": "A confirmar",
                "mes_evento": "2026-11", # Por defecto mes siguiente o actual según contexto
                "impacto_mmm3d": None,
                "estado": "A programar"
            })

    # 2. Procesar Tablas (muy común en las minutas del CCO para GPM y plantas)
    for table in doc.tables:
        for row in table.rows:
            cells = [clean_text(cell.text) for cell in row.cells]
            if len(cells) >= 2:
                # Intentar estructurar filas de tablas de obras/plantas
                fila_texto = " | ".join([c for c in cells if c])
                if len(fila_texto) > 10 and not any(h in fila_texto.lower() for h in ['empresa', 'apellido', 'nombre', 'contacto']):
                    # Buscar impacto en la tabla
                    impacto = None
                    for cell in cells:
                        match = impact_pattern.search(cell)
                        if match:
                            try:
                                impacto = float(match.group(1).replace(',', '.'))
                            except ValueError:
                                pass
                                
                    records.append({
                        "cuenca_zona": current_cuenca,
                        "empresa": current_empresa,
                        "instalacion": cells[0] if cells else "Planta",
                        "obra_tarea": fila_texto,
                        "fecha_texto": cells[1] if len(cells) > 1 else "A confirmar",
                        "mes_evento": "2026-11",
                        "impacto_mmm3d": impacto,
                        "estado": "Confirmado"
                    })

    return records


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    
    # Buscar el archivo de minuta más reciente en raw/
    if not os.path.exists(RAW_DIR):
        print(f"ERROR: La carpeta {RAW_DIR} no existe.", file=sys.stderr)
        sys.exit(1)
        
    doc_files = [os.path.join(RAW_DIR, f) for f in os.listdir(RAW_DIR) if f.startswith("Minuta") and f.endswith(".docx")]
    if not doc_files:
        print("ERROR: No se encontró ningún archivo 'Minuta...docx' en raw/", file=sys.stderr)
        sys.exit(1)
        
    latest_file = max(doc_files, key=os.path.getmtime)
    print(f"Procesando minuta: {latest_file}")
    
    data = parse_cco_docx(latest_file)
    
    output = {
        "generated_at": datetime.now().isoformat(),
        "source": os.path.basename(latest_file),
        "data": data
    }
    
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        
    print(f"ÉXITO: Generado {OUT_JSON} con {len(data)} registros de mantenimientos.")


if __name__ == '__main__':
    main()
