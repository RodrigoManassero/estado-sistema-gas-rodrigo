import os
import re
import urllib.request
import json

ONEDRIVE_URL = os.environ.get("ONEDRIVE_FOLDER_URL")
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "raw")

os.makedirs(RAW_DIR, exist_ok=True)

if not ONEDRIVE_URL:
    print("⚠️ No se encontró la variable ONEDRIVE_FOLDER_URL. Se omitirá la descarga de OneDrive.")
    exit(0)

print("🔍 Buscando archivos nuevos en OneDrive...")

# Convertir enlace público de OneDrive a enlace de descarga directa/API
# (Si usas un enlace compartido de OneDrive, esta función descarga el contenido)
try:
    # Intenta descargar el índice/archivos desde el enlace compartido
    req = urllib.request.Request(ONEDRIVE_URL, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')

    # Buscar enlaces a archivos PDF de Síntesis
    matches = re.findall(r'href="([^"]+Síntesis[^\"]+\.pdf)"', html, re.IGNORECASE)
    
    print(f"Archivos encontrados en la respuesta de OneDrive: {len(matches)}")
except Exception as e:
    print(f" Error al conectar con OneDrive: {e}")
