#!/usr/bin/env python3
"""Parse CCO Word minutas (.docx) from raw/ and generate clean public/data/mantenimientos.json."""

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


def extract_impact_text(text: str) -> str:
    # Captura tanto si dice "Impacto", "Afectación", "Impacto potencial" o "Impacto estimado"
    match = re.search(r'(?:afectación|impacto|impacto potencial|impacto estimado)[:\s]*(.*)', text, re.IGNORECASE)
    if match:
        val_str = clean_text(match.group(1))
        val_lower = val_str.lower()
        
        # Si el texto indica que no hay impacto, unificamos a "0 MM³/día"
        if any(kw in val_lower for kw in ['sin impacto', 'no', 'sin restricción', 'sin afectación', 'no hay']):
            return "0 MM³/día"
            
        return val_str
        
    text_lower = text.lower()
    if any(kw in text_lower for kw in ['sin impacto', 'sin restricción', 'sin afectación']):
        return "0 MM³/día"
        
    return "A confirmar"


def extract_month(text: str) -> str:
    text_lower = text.lower()
    if 'octubre' in text_lower or '10/' in text_lower or '28/10' in text_lower:
        return "2026-10"
    if 'noviembre' in text_lower or '11/' in text_lower:
        return "2026-11"
    if 'diciembre' in text_lower or '12/' in text_lower:
        return "2026-12"
    
    date_match = re.search(r'(\d{1,2})/(\d{1,2})', text)
    if date_match:
        m = int(date_match.group(2))
        if 1 <= m <= 12:
            return f"2026-{m:02d}"
            
    return "2026-10"


def parse_cco_docx(file_path: str) -> list[dict]:
    doc = docx.Document(file_path)
    records = []
    
    current_cuenca = "Cuenca Neuquina"
    current_empresa = "TGS"
    current_instalacion = "General"
    
    ignore_phrases = [
        "no tiene mantenimientos", "sin novedades", "no participó", 
        "no realizó comentarios", "se continuará con las reuniones",
        "los mantenimientos previstos fueron realizados", "se finalizaron todas las tareas"
    ]

    current_obra = None
    current_fecha = "A programar"
    current_impacto = "0 MM³/día"

    for p in doc.paragraphs:
        text = clean_text(p.text)
        if not text or len(text) < 3:
            continue
            
        text_lower = text.lower()
        
        if any(phrase in text_lower for phrase in ignore_phrases) or "se llevó a cabo" in text_lower or "participantes:" in text_lower:
            continue
            
        # Detectar Cuencas
        if "Cuenca" in text or "Tramos Finales" in text:
            if len(text) < 40:
                current_cuenca = text
                continue
                
        # Detectar Empresa
        if text.upper() in ["TGS", "TGN"]:
            current_empresa = text.upper()
            continue

        # Detectar Tramos o Plantas (Instalación)
        if text.startswith("Tramo ") or text.startswith("Planta ") or text.startswith("Sección "):
            current_instalacion = text
            continue

        # Capturar Obra o Tarea
        if text.startswith("Obra:") or text.startswith("Tarea:"):
            current_obra = text.split(":", 1)[1].strip()
            continue
        elif any(kw in text_lower for kw in ['cambio de', 'reparación', 'prueba', 'corrida', 'paro', 'mantenimiento', 'verificación', 'adecuación', 'tie-in', 'recobertura']):
            current_obra = text
            continue

        # Capturar Fecha / Periodo
        if text.startswith("Fecha:") or text.startswith("Periodo:"):
            current_fecha = text.split(":", 1)[1].strip()
            mes = extract_month(current_fecha)
            
            # Si ya tenemos obra detectada, armar el registro
            if current_obra:
                records.append({
                    "cuenca_zona": current_cuenca,
                    "empresa": current_empresa,
                    "instalacion": current_instalacion,
                    "obra_tarea": current_obra,
                    "fecha_texto": current_fecha,
                    "mes_evento": mes,
                    "impacto_mmm3d": current_impacto
                })
                current_obra = None # Reset
                current_impacto = "0 MM³/día" # Reset por defecto a 0

        # Capturar Afectación / Impacto
        if text.startswith("Afectación:") or text.startswith("Impacto:") or text.startswith("Impacto potencial:") or text.startswith("Impacto estimado:"):
            current_impacto = extract_impact_text(text)

    # Procesar tablas (ej: GPM y plantas)
    for table in doc.tables:
        for row in table.rows:
            cells = [clean_text(cell.text) for cell in row.cells]
            if len(cells) >= 3:
                inst, fecha, imp = cells[0], cells[1], cells[2]
                if inst and fecha and not any(h in inst.lower() for h in ['planta', 'empresa']):
                    records.append({
                        "cuenca_zona": "Gasoducto GPM",
                        "empresa": "TGS",
                        "instalacion": inst,
                        "obra_tarea": "Mantenimiento / Adecuación de Planta",
                        "fecha_texto": fecha,
                        "mes_evento": extract_month(fecha),
                        "impacto_mmm3d": imp
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
        
    print(f"ÉXITO: Generado {OUT_JSON} con {len(data)} registros estructurados.")


if __name__ == '__main__':
    main()
