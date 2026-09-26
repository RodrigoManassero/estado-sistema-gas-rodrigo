import os
import re
import json
import logging
import datetime
from typing import Dict, Any, List, Optional
import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

BASE_URL = "https://www.tgn.com.ar"  # Reemplazar con la URL base o endpoint exacto de ABII
SYSTEM_STATE_ENDPOINT = "/ABII/Reportes/EstadoSistema" # Ajustar según el endpoint real

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
}

def _to_float(value: Optional[str]) -> Optional[float]:
    if not value or value.strip() in ["", "N/A", "-"]:
        return None
    cleaned = value.strip().replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None

def _iso_date(raw_date_str: str) -> str:
    """ Convierte fechas como 'Fri Sep 25 00:00:00 ART 2026' o '25/09/2026' a formato ISO 'YYYY-MM-DD' """
    raw = raw_date_str.strip()
    if not raw:
        return ""
    
    # Intento 1: Formato corto DD/MM/YYYY
    if re.match(r"^\d{2}/\d{2}/\d{4}$", raw):
        parts = raw.split("/")
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    
    # Intento 2: Formato largo de servidor Java (ej: Fri Sep 25 00:00:00 ART 2026)
    match = re.search(r"([A-Za-z]{3})\s+([A-Za-z]{3})\s+(\d{1,2}).*?(\d{4})$", raw)
    if match:
        month_str, day_str, year_str = match.group(2), match.group(3), match.group(4)
        try:
            dt = datetime.datetime.strptime(f"{month_str} {day_str} {year_str}", "%b %d %Y")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    return raw

def _parse_table_by_caption(soup: BeautifulSoup, caption_keyword: str) -> Dict[str, str]:
    """ Busca una tabla por el texto de su caption/encabezado y mapea sus headers con su fila de datos """
    data = {}
    target_table = None

    # Buscar por caption o por celdas con el título de la sección
    for caption in soup.find_all(["caption", "td", "th", "div"]):
        if caption_keyword.lower() in caption.get_text().lower():
            parent_table = caption.find_parent("table")
            if parent_table:
                target_table = parent_table
                break

    if not target_table:
        return data

    # Extraer encabezados limpiando saltos <br>
    headers = []
    header_row = target_table.find("tr")
    if header_row:
        for cell in header_row.find_all(["th", "td"]):
            text = cell.get_text(separator=" ", strip=True)
            text = re.sub(r"\s+", " ", text)
            headers.append(text)

    # Extraer la primera fila de datos relevante
    for tr in target_table.find_all("tr")[1:]:
        cols = tr.find_all("td")
        if len(cols) == len(headers) and len(cols) > 0:
            for header, col in zip(headers, cols):
                data[header] = col.get_text(strip=True)
            break

    return data

def _scrape_system_state_day(session: requests.Session, target_date: datetime.date) -> Optional[Dict[str, Any]]:
    date_str = target_date.strftime("%d/%m/%Y")
    payload = {
        "fechaDesde": date_str,
        "fechaHasta": date_str,
        "gasoducto": "TGN"
    }

    try:
        response = session.post(f"{BASE_URL}{SYSTEM_STATE_ENDPOINT}", data=payload, headers=HEADERS, timeout=15)
        response.raise_for_status()
    except Exception as e:
        logging.error(f"Error consultando fecha {date_str}: {e}")
        return None

    soup = BeautifulSoup(response.text, "html.parser")

    # 1. Extraer grilla Linepack
    linepack_raw = _parse_table_by_caption(soup, "Linepack")
    
    # 2. Extraer grilla Estado del Sistema
    status_raw = _parse_table_by_caption(soup, "Estado del Sistema")

    if not linepack_raw and not status_raw:
        return None

    # Normalización de clave de fecha
    raw_date = linepack_raw.get("Día Operativo") or status_raw.get("Día Operativo") or date_str
    formatted_date = _iso_date(raw_date)

    actual = _to_float(linepack_raw.get("Actual"))
    equilibrio = _to_float(linepack_raw.get("Equilibrio"))
    desbalance = _to_float(linepack_raw.get("Desbalance del sistema"))

    # Sentinel Check: Si es un día aún no cerrado donde Actual == Equilibrio y Desbalance es 0
    if actual is not None and equilibrio is not None and actual == equilibrio and desbalance == 0:
        logging.info(f"Día {formatted_date} descartado por ser valor provisional / sentinel.")
        return None

    return {
        "fecha": formatted_date,
        "actual": actual,
        "equilibrio": equilibrio,
        "desbalance": desbalance,
        "desbalance_porcentual": _to_float(linepack_raw.get("Desbalance porcentual")),
        "estado": status_raw.get("Estado", "NORMAL"),
        "zona": status_raw.get("Zona", "Todas"),
        "tolerancia_minima": _to_float(status_raw.get("Tolerancia Mínima")),
        "tolerancia_maxima": _to_float(status_raw.get("Tolerancia Máxima")),
        "observaciones": status_raw.get("Observaciones", "N/A")
    }

def fetch_system_state(days_back: int = 7) -> List[Dict[str, Any]]:
    session = requests.Session()
    results = []
    today = datetime.date.today()

    for i in range(days_back):
        target_date = today - datetime.timedelta(days=i)
        logging.info(f"Procesando Estado del Sistema para: {target_date.strftime('%Y-%m-%d')}")
        record = _scrape_system_state_day(session, target_date)
        if record:
            results.append(record)

    # Ordenar cronológicamente (de más antiguo a más reciente)
    results.sort(key=lambda x: x["fecha"])
    return results

def save_json(data: List[Dict[str, Any]], filename: str = "tgn_system_state.json"):
    payload = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "source": "TGN - Estado del Sistema",
        "data": data
    }
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    logging.info(f"Archivo {filename} actualizado exitosamente con {len(data)} registros.")

if __name__ == "__main__":
    records = fetch_system_state(days_back=5)
    save_json(records)
