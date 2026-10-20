#!/usr/bin/env python3
"""Parse CCO Word minutas (.docx) from raw/ and generate a clean public/data/mantenimientos.json."""

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


def extract_impact(text: str) -> float | None:
    # Busca patrones como "4MM/día", "8 MM m3/d", "10MM/día", "-1,5 MM"
    match = re.search(r'(?:impacto|afectación|in y máx|inyección máx)[^\d]*([-\d,\.]+)\s*MM', text, re.IGNORECASE)
    if not match:
        match = re.search(r'([-\d,\.]+)\s*MM\s*m[³3]', text, re.IGNORECASE)
    if match:
        try:
            return float(match.group(1).replace(',', '.'))
        except ValueError:
            pass
    return None


def extract_month(text: str) -> str:
    # Si encuentra una fecha con formato DD/MM o DD/MM/YYYY
    date_match = re.search(r'(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?', text)
    if date_match:
        month = int(date_match.group(2))
        if month == 10:
            return "2026-10"
        elif month == 11:
            return "2026-11"
        elif month == 12:
            return "2026-12"
        elif month <= 9:
            return f"2026-{month:02d}"
            
    # Si menciona explícitamente el mes en texto
    text_lower = text.lower()
    if 'octubre' in text_lower:
        return "2026-10"
    if 'noviembre' in text_lower:
        return "2026-11"
    if 'diciembre' in text_lower:
        return "2026-12"
        
    # Por defecto, si no especifica mes exacto, lo ubicamos en el mes en curso (Octubre)
    return "2026-10"


def parse_cco_docx(file_path: str) -> list[dict]:
    doc = docx.Document(file_path)
    records = []
    
    current_cuenca = "General"
    current_empresa = "General"
    current_instalacion = ""
    
    # Términos que indican que NO hay que registrar nada
    ignore_phrases = [
        "no tiene mantenimientos", "sin novedades", "no participó", 
        "no realizó comentarios", "se continuará con las reuniones",
        "los mantenimientos previstos fueron realizados"
    ]

    # 1. Procesamiento de Párrafos
    for p in doc.paragraphs:
        text = clean_text(p.text)
        if not text or len(text) < 5:
            continue
            
        text_lower = text.lower()
        
        # Ignorar párrafos de relleno, negativos o introductorios
        if any(phrase in text_lower for phrase in ignore_phrases) or "se llevó a cabo" in text_lower or "participantes:" in text_lower:
            continue
            
        # Detectar Cuencas o Secciones Principales
        if "Cuenca" in text or "Tramos Finales" in text or "Gasoducto" in text:
            if len(text) < 40:
                current_cuenca = text
                continue
                
        # Detectar Empresas
        empresas = ["TGS", "TGN", "YPF", "PAE", "TECPETROL", "TOTAL", "CAMMESA", "MEGA", "GPM", "CGC", "ROCH", "VISTA", "CAPEX", "ENARSA"]
        if text.upper() in empresas or any(text.upper().startswith(e + " ") for e in empresas):
            current_empresa = text.split()[0]
            continue

        # Si el texto describe una obra, tarea o mantenimiento real
        if any(kw in text_lower for kw in ['obra:', 'tarea:', 'cambio de', 'reparación', 'prueba', 'corrida', 'paro', 'mantenimiento', 'verificación', 'adecuación', 'tie-in', 'recobertura']):
            impacto = extract_impact(text)
            mes = extract_month(text)
            
            records.append({
                "cuenca_zona": current_cuenca,
                "empresa": current_empresa,
                "instalacion": current_instalacion or current_empresa,
                "obra_tarea": text,
                "fecha_texto": text,
                "mes_evento": mes,
                "impacto_mmm3d": impacto,
                "estado": "A confirmar" if "a confirmar" in text_lower else "Confirmado"
            })

    # 2. Procesamiento de Tablas (ej: planillas de GPM y plantas)
    for table in doc.tables:
        for row in table.rows:
            cells = [clean_text(cell.text) for cell in row.cells]
            if len(cells) >= 2:
                fila_texto = " | ".join([c for c in cells if c])
                if len(fila_texto) > 10 and not any(h in fila_texto.lower() for h in ['empresa', 'apellido', 'nombre', 'contacto', 'planta']):
                    impacto = None
                    for cell in cells:
                        imp = extract_impact(cell)
                        if imp:
                            impacto = imp
                            
                    mes = extract_month(fila_texto)
                    
                    records.append({
                        "cuenca_zona": current_cuenca,
                        "empresa": current_empresa,
                        "instalacion": cells[0] if cells else "Planta",
                        "obra_tarea": fila_texto,
                        "fecha_texto": cells[1] if len(cells) > 1 else "A confirmar",
                        "mes_evento": mes,
                        "impacto_mmm3d": impacto,
                        "estado": "Confirmado"
                    })

    return records


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    
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
        
    print(f"ÉXITO: Generado {OUT_JSON} con {len(data)} registros de mantenimientos limpios.")


if __name__ == '__main__':
    main()
