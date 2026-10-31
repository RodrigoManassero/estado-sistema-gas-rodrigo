#!/usr/bin/env python3
"""
Genera public/data/cammesa_weekly.json (consumo semanal de combustibles de CAMMESA) de forma automatica.

Proceso:
  1. Sincroniza raw/cammesa_psem/: descarga el zip de la Programacion Semanal (psemWWYY.zip) que
     todavia no este y deja las ultimas 2 semanas (ver scripts/fetch_cammesa_psem.py).
  2. Abre cada zip, lee el .MDB que contiene (sin necesidad de descomprimir en disco) y de ahi:
       - tabla FECHA          -> FInicio = lunes de la semana
       - tabla CONSUMO_COMB   -> Dia1..Dia7 = lunes a domingo
  3. Se queda con los 2 programas mas recientes y arma una fila por dia:
       gas_dam3 = GasAcue + GasProp, go = Dies_Oil, fo = Fuel_Oil, cm = Carbon
     (valores tal como los informa CAMMESA; las conversiones se hacen despues, en build_daily.py).
  4. Escribe el JSON con el mismo formato de siempre.

Respaldo: si no hay ningun zip utilizable, usa el Excel manual raw/info_weekly.xlsx (proceso anterior).

Uso:
    python scripts/fetch_cammesa_weekly.py                 # descarga lo que falta y genera el JSON
    python scripts/fetch_cammesa_weekly.py --sin-descarga  # solo usa lo que ya esta en raw/
"""

import argparse
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

import fetch_cammesa_psem as psem   # noqa: E402  (descarga y control de lo que ya esta en raw)
from mdb_lite import MDB, MDBError  # noqa: E402  (lector del .MDB)

# =============================================================================
# CONFIGURACION
# =============================================================================
# >>> MODIFICAR AQUI si cambian las carpetas. <<<
RAW_DIR = BASE_DIR.parent / "raw" / "cammesa_psem"          # zips descargados de CAMMESA
RAW_XLSX = BASE_DIR.parent / "raw" / "info_weekly.xlsx"      # respaldo manual (proceso anterior)
OUT_FILE = BASE_DIR.parent / "public" / "data" / "cammesa_weekly.json"

PROGRAMAS_A_USAR = 2   # semanas que se incluyen en el JSON (las mas recientes)
DIAS_ATRAS = 7         # dias hacia atras que se consultan en CAMMESA (semana anterior)
DIAS_ADELANTE = 7      # dias hacia adelante (el programa de la semana siguiente se publica el jueves anterior)

# Filas de CONSUMO_COMB que se usan. Las demas se ignoran, pero si traen valores se avisa.
FILAS_GAS = ("GasAcue", "GasProp")
FILA_GO, FILA_FO, FILA_CM = "Dies_Oil", "Fuel_Oil", "Carbon"
FILAS_GAS_IGNORADAS = ("Gas_659", "Gas_glo", "Gas_p")

RE_PSEM = re.compile(r"^psem(\d{2})(\d{2})\.zip$", re.IGNORECASE)


def log(msg):
    print(msg, flush=True)


def aviso(msg):
    psem.aviso(msg)


# =============================================================================
# Lectura de los programas (zip -> MDB)
# =============================================================================
class Programa:
    """Una Programacion Semanal ya leida."""

    def __init__(self, nombre, inicio, num_semana, consumo, mtime):
        self.nombre, self.inicio, self.num_semana = nombre, inicio, num_semana
        self.consumo, self.mtime = consumo, mtime


def _num(v):
    return float(v) if isinstance(v, (int, float)) else 0.0


def leer_programa(zip_path):
    """Lee FECHA y CONSUMO_COMB de un zip psemWWYY. Lanza MDBError/ValueError si algo no cuadra."""
    with zipfile.ZipFile(zip_path) as z:
        mdbs = [n for n in z.namelist() if n.lower().endswith(".mdb")]
        if len(mdbs) != 1:
            raise ValueError("el zip deberia tener un unico .MDB y tiene %d" % len(mdbs))
        db = MDB(z.read(mdbs[0]))

    fechas = db.read_table("FECHA")
    if len(fechas) != 1 or not isinstance(fechas[0].get("FInicio"), datetime):
        raise ValueError("la tabla FECHA no tiene el formato esperado: %r" % (fechas,))
    inicio = fechas[0]["FInicio"].date()
    num_semana = fechas[0].get("NumSemana")

    consumo = {}
    for fila in db.read_table("CONSUMO_COMB"):
        consumo[str(fila["Combustible"]).strip()] = [fila.get("Dia%d" % i) for i in range(1, 8)]
    faltan = [n for n in (*FILAS_GAS, FILA_GO, FILA_FO, FILA_CM) if n not in consumo]
    if faltan:
        raise ValueError("CONSUMO_COMB no tiene las filas %s" % ", ".join(faltan))

    # Controles cruzados: el nombre del zip, FECHA y el calendario deben contar la misma historia.
    m = RE_PSEM.match(Path(zip_path).name)
    if m and num_semana is not None and int(m.group(1)) != int(num_semana):
        aviso("%s: el nombre dice semana %s pero FECHA.NumSemana = %s" % (Path(zip_path).name, m.group(1), num_semana))
    if inicio.weekday() != 0:
        aviso("%s: FInicio (%s) no es lunes; se asume igual que Dia1 es ese dia" % (Path(zip_path).name, inicio))
    for nombre in FILAS_GAS_IGNORADAS:
        if any(_num(v) for v in consumo.get(nombre, [])):
            aviso("%s: la fila %s trae valores y NO se suma al gas (hoy solo se usan %s)"
                  % (Path(zip_path).name, nombre, " + ".join(FILAS_GAS)))
    return Programa(Path(zip_path).name, inicio, num_semana, consumo, Path(zip_path).stat().st_mtime)


def leer_programas(raw_dir):
    programas = []
    for z in sorted(Path(raw_dir).glob("*.zip")) if Path(raw_dir).is_dir() else []:
        if not RE_PSEM.match(z.name):
            continue
        try:
            programas.append(leer_programa(z))
        except (MDBError, ValueError, zipfile.BadZipFile, OSError, KeyError) as e:
            aviso("No se pudo leer %s: %s" % (z.name, e))
    return programas


# =============================================================================
# Armado de filas
# =============================================================================
def elegir(programas, cantidad=PROGRAMAS_A_USAR):
    """Los `cantidad` programas con inicio mas reciente. Si dos zips tienen el mismo inicio
    (republicacion), se queda con el mas nuevo."""
    por_inicio = {}
    for p in programas:
        previo = por_inicio.get(p.inicio)
        if previo is None or p.mtime > previo.mtime:
            por_inicio[p.inicio] = p
    return [por_inicio[k] for k in sorted(por_inicio)][-cantidad:]


def construir_filas(programas):
    """Una fila por dia. Si un dia aparece en dos programas, gana el mas reciente."""
    por_fecha = {}
    for p in sorted(programas, key=lambda p: p.inicio):
        for i in range(7):
            fecha = (p.inicio + timedelta(days=i)).isoformat()
            c = p.consumo
            por_fecha[fecha] = {
                "fecha": fecha,
                "gas_dam3": sum(_num(c[n][i]) for n in FILAS_GAS),
                "go": _num(c[FILA_GO][i]),
                "fo": _num(c[FILA_FO][i]),
                "cm": _num(c[FILA_CM][i]),
                "source": "weekly",
            }
    return [por_fecha[k] for k in sorted(por_fecha)]


# =============================================================================
# Respaldo: Excel manual (proceso anterior)
# =============================================================================
def parse_fecha(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    val_str = str(val).strip().split(" ")[0].split("T")[0]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(val_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return val_str[:10] if len(val_str) >= 10 else val_str


def filas_desde_excel(ruta):
    from openpyxl import load_workbook
    ws = load_workbook(ruta, data_only=True).active
    headers = []
    for col in range(2, ws.max_column + 1):
        f = parse_fecha(ws.cell(row=1, column=col).value)
        if f:
            headers.append(f)
    comb = {}
    for row in range(2, ws.max_row + 1):
        nombre = ws.cell(row=row, column=1).value
        if nombre:
            comb[str(nombre).strip()] = [float(ws.cell(row=row, column=col).value or 0)
                                         for col in range(2, ws.max_column + 1)]
    return [{
        "fecha": f,
        "gas_dam3": comb.get("Gas", [0] * len(headers))[i],
        "go": comb.get("Dies_Oil", [0] * len(headers))[i],
        "fo": comb.get("Fuel_Oil", [0] * len(headers))[i],
        "cm": comb.get("Carbon", [0] * len(headers))[i],
        "source": "weekly",
    } for i, f in enumerate(headers)]


# =============================================================================
# Programa principal
# =============================================================================
def escribir_json(filas, destino):
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(destino.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(filas, f, indent=2, ensure_ascii=False)
    os.replace(tmp, destino)


def main():
    ap = argparse.ArgumentParser(description="Genera cammesa_weekly.json desde la Programacion Semanal de CAMMESA.")
    ap.add_argument("--raw-dir", default=str(RAW_DIR), help="Carpeta con los zips (por defecto RAW_DIR).")
    ap.add_argument("--xlsx", default=str(RAW_XLSX), help="Excel manual de respaldo.")
    ap.add_argument("--out", default=str(OUT_FILE), help="JSON de salida.")
    ap.add_argument("--sin-descarga", action="store_true", help="No consultar CAMMESA; usar lo que ya esta en raw/.")
    args = ap.parse_args()
    raw_dir = Path(args.raw_dir)

    # 1) Sincronizar con CAMMESA. Si falla, se sigue con lo que ya hay en raw/.
    if not args.sin_descarga:
        try:
            errores = psem.sincronizar(raw_dir, dias_atras=DIAS_ATRAS, dias_adelante=DIAS_ADELANTE, extraer_zips=False)
            if errores:
                aviso("%d archivo(s) de CAMMESA no se pudieron descargar; se usa lo que hay en raw/" % errores)
        except (psem.ErrorApi, psem.ErrorConfig) as e:
            aviso("No se pudo sincronizar con CAMMESA (%s); se usa lo que hay en raw/" % e)

    # 2) Leer los programas disponibles y armar las filas
    elegidos = elegir(leer_programas(raw_dir))
    if elegidos:
        filas = construir_filas(elegidos)
        origen = ", ".join("%s (semana del %s)" % (p.nombre, p.inicio) for p in elegidos)
    elif Path(args.xlsx).is_file():
        aviso("No hay zips utilizables en %s: se usa el Excel manual %s" % (raw_dir, args.xlsx))
        filas = filas_desde_excel(args.xlsx)
        origen = "Excel manual " + Path(args.xlsx).name
    else:
        print("ERROR: no hay ningun zip de CAMMESA en %s ni el Excel de respaldo %s" % (raw_dir, args.xlsx), file=sys.stderr)
        return 1

    if not filas:
        print("ERROR: no se obtuvo ninguna fila", file=sys.stderr)
        return 1
    escribir_json(filas, args.out)
    log("EXITO: cammesa_weekly.json con %d filas (%s -> %s). Origen: %s"
        % (len(filas), filas[0]["fecha"], filas[-1]["fecha"], origen))
    return 0


if __name__ == "__main__":
    sys.exit(main())
