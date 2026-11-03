#!/usr/bin/env python3
"""
Arma el HISTORIAL de Programaciones Semanales de CAMMESA en un CSV compacto (una fila por dia).

Para que sirve: tener varios meses de datos del balance electrico (demanda, hidraulica, nuclear,
renovables, importacion, termica) y del consumo de gas, para ajustar y validar el modelo de usinas.

Que hace:
  1. Consulta la API de CAMMESA hacia atras (por defecto 104 semanas) y baja SOLO los zips cuyo
     (programa, version) todavia no este en el CSV. Es reanudable: se puede cortar y volver a correr.
  2. Abre cada zip en memoria, lee el .MDB con mdb_lite (sin descomprimir en disco) y extrae las
     tablas FECHA, RESUMEN, GENERACION (solo nuclear por central), CONSUMO_COMB y TEMPERATURAS.
  3. Agrega las filas al CSV y descarta el zip (no se guardan los zips, salvo con --guardar-zips).
     Resultado: raw/cammesa_psem_hist/psem_historial.csv (~200 KB para dos anios).
  4. Deja un resumen en psem_historial_estado.json con las semanas que no se pudieron leer y por que.

Uso:
    python scripts/build_psem_history.py                    # baja lo que falte (104 semanas hacia atras)
    python scripts/build_psem_history.py --semanas 52       # solo un anio
    python scripts/build_psem_history.py --desde-raw        # no descarga: usa los zips de raw/cammesa_psem/

Unidades (como las informa CAMMESA): energia en MWh/dia, potencia en MW, gas en dam3/dia
(1 MMm3 = 1000 dam3), combustibles liquidos en m3/dia, temperatura en grados C.
"""

import argparse
import csv
import io
import json
import os
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

import fetch_cammesa_psem as psem   # noqa: E402  (listado y descarga de CAMMESA)
from mdb_lite import MDB, MDBError  # noqa: E402  (lector del .MDB)

# =============================================================================
# CONFIGURACION
# =============================================================================
# >>> MODIFICAR AQUI si queres guardar el historial en otra carpeta. <<<
HIST_DIR = BASE_DIR.parent / "raw" / "cammesa_psem_hist"
CSV_NAME = "psem_historial.csv"
ESTADO_NAME = "psem_historial_estado.json"
RAW_ZIPS = BASE_DIR.parent / "raw" / "cammesa_psem"   # zips de la corrida semanal (para --desde-raw)

ESQUEMA = 2          # sube cuando cambia la forma de leer/guardar los datos: obliga a rehacer el CSV (--rehacer)
SEMANAS = 104        # 2 anios: dos inviernos y dos veranos, y mas de un ciclo hidrologico
BLOQUE_DIAS = 84     # la consulta a la API se hace de a 12 semanas
PAUSA = 1.5          # segundos entre descargas (se baja de a uno, sin apuro)

# Variables de la tabla RESUMEN que se guardan (nombre CAMMESA en minusculas = nombre de columna).
RESUMEN_VARS = ["DEMNETA", "PERDIDAS", "DEMBRUTA", "EXPORT", "BOMBEO", "DEMABAST", "FALLAS", "IMPORT",
                "GEN_TV", "GEN_TG", "GEN_CC", "GEN_DI", "GEN_NU", "GEN_HI", "GEN_RE",
                "POTPICO", "POTEXPP", "POTTPICO"]
# Sin estas el balance no se puede armar: el programa se descarta con un mensaje claro.
REQUERIDAS = ["DEMABAST", "IMPORT", "GEN_TV", "GEN_TG", "GEN_CC", "GEN_DI", "GEN_NU", "GEN_HI", "GEN_RE"]
TERMICAS = ["GEN_TV", "GEN_TG", "GEN_CC", "GEN_DI"]

# Centrales nucleares (columna GENERACION.Generador). Una central nueva se suma en nuc_otros.
NUCLEARES = {"EMBANUCL": "nuc_embalse", "ATUCNUCL": "nuc_atucha1", "ATU2NUCL": "nuc_atucha2"}
# El gas de CONSUMO_COMB viene en tres formatos segun la semana:
#   - archivos viejos:  una sola fila "Gas" (el total)
#   - archivos nuevos:  "GasAcue" + "GasProp" (o "GasProv", como figura en algunas semanas)
#   - a veces solo "GasAcue" (no hay fila de gas propio)
GAS_ACUE = "GasAcue"
GAS_PROP = ("GasProp", "GasProv")
GAS_TOTAL_VIEJO = "Gas"
GAS_OTROS = ("Gas_659", "Gas_glo", "Gas_p")             # no se suman al gas total

COLUMNAS = (["fecha", "programa", "semana", "publicado", "version", "temp_cammesa"]
            + [v.lower() for v in RESUMEN_VARS]
            + ["gen_termica", "cierre_pct", "nuc_embalse", "nuc_atucha1", "nuc_atucha2", "nuc_otros",
               "gas_acue", "gas_prop", "gas_total", "gas_otros", "gas_fuente", "dies_oil", "fuel_oil", "carbon"])

ERRORES_LECTURA = (psem.ErrorApi, MDBError, ValueError, KeyError, OSError, zipfile.BadZipFile)


def log(msg):
    print(msg, flush=True)


# =============================================================================
# Lectura de un programa
# =============================================================================
def _n(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _suma(*vals):
    xs = [v for v in vals if v is not None]
    return sum(xs) if xs else None


def filas_de_programa(datos_zip, nombre, publicado="", version=""):
    """Las 7 filas diarias de un zip psemWWYY. Lanza ValueError/MDBError si algo no cuadra."""
    with zipfile.ZipFile(io.BytesIO(datos_zip)) as z:
        mdbs = [n for n in z.namelist() if n.lower().endswith(".mdb")]
        if len(mdbs) != 1:
            raise ValueError("el zip deberia tener un unico .MDB y tiene %d" % len(mdbs))
        db = MDB(z.read(mdbs[0]))

    fechas = db.read_table("FECHA", estricto=True)
    if len(fechas) != 1 or not isinstance(fechas[0].get("FInicio"), datetime):
        raise ValueError("la tabla FECHA no tiene el formato esperado")
    inicio = fechas[0]["FInicio"].date()
    semana = fechas[0].get("NumSemana")

    resumen = {str(r["Var"]).strip(): [_n(r.get("Dia%d" % i)) for i in range(1, 8)]
               for r in db.read_table("RESUMEN", estricto=True)}
    faltan = [v for v in REQUERIDAS if v not in resumen]
    if faltan:
        raise ValueError("RESUMEN no tiene las variables %s (variables que si trae: %s)"
                         % (", ".join(faltan), ", ".join(sorted(resumen)) or "ninguna"))

    comb = {str(r["Combustible"]).strip(): [_n(r.get("Dia%d" % i)) for i in range(1, 8)]
            for r in db.read_table("CONSUMO_COMB", estricto=True)}
    for n in ("Dies_Oil", "Fuel_Oil", "Carbon"):
        if n not in comb:
            # Se informan las filas que SI trae, para poder adaptar el lector sin tener que bajar el archivo.
            raise ValueError("CONSUMO_COMB no tiene la fila %s (filas que si trae: %s)"
                             % (n, ", ".join(sorted(comb)) or "ninguna"))
    nombre_prop = next((n for n in GAS_PROP if n in comb), None)
    if GAS_TOTAL_VIEJO in comb and (GAS_ACUE in comb or nombre_prop):
        raise ValueError("CONSUMO_COMB trae a la vez 'Gas' y 'GasAcue/GasProp': no se sabe cual es el total (filas: %s)"
                         % ", ".join(sorted(comb)))
    if GAS_TOTAL_VIEJO in comb:
        gas_fuente = GAS_TOTAL_VIEJO
    elif GAS_ACUE in comb:
        gas_fuente = GAS_ACUE + ("+" + nombre_prop if nombre_prop else "")
    else:
        raise ValueError("CONSUMO_COMB no tiene ninguna fila de gas (filas que si trae: %s)" % ", ".join(sorted(comb)))

    temps = db.read_table("TEMPERATURAS", estricto=True)
    temp = [_n(temps[0].get("Dia%d" % i)) for i in range(1, 8)] if len(temps) == 1 else [None] * 7

    nuc = {c: [None] * 7 for c in (*NUCLEARES.values(), "nuc_otros")}
    for r in db.read_table("GENERACION", estricto=True):
        generador = str(r.get("Generador") or "").strip()
        if r.get("Var") != "GEN_NUC" or not generador:
            continue          # sin Generador es un subtotal (total, region o empresa): no se suma
        col = NUCLEARES.get(generador, "nuc_otros")
        for i in range(7):
            nuc[col][i] = _suma(nuc[col][i], _n(r.get("Dia%d" % (i + 1))))

    filas = []
    for i in range(7):
        f = {c: "" for c in COLUMNAS}
        f.update(fecha=(inicio + timedelta(days=i)).isoformat(), programa=nombre, semana=semana or "",
                 publicado=publicado, version=version, temp_cammesa=temp[i])
        for v in RESUMEN_VARS:
            f[v.lower()] = resumen.get(v, [None] * 7)[i]
        ter = _suma(*[resumen[v][i] for v in TERMICAS])
        f["gen_termica"] = ter
        no_term = _suma(resumen["GEN_HI"][i], resumen["GEN_NU"][i], resumen["GEN_RE"][i], resumen["IMPORT"][i])
        dem = resumen["DEMABAST"][i]
        if ter and dem is not None and no_term is not None:
            f["cierre_pct"] = (dem - no_term - ter) / ter * 100.0   # calidad del balance: ~0
        for col, serie in nuc.items():
            f[col] = serie[i]
        if gas_fuente == GAS_TOTAL_VIEJO:
            f["gas_acue"], f["gas_prop"], f["gas_total"] = None, None, comb[GAS_TOTAL_VIEJO][i]
        else:
            f["gas_acue"] = comb[GAS_ACUE][i]
            f["gas_prop"] = comb[nombre_prop][i] if nombre_prop else None
            f["gas_total"] = _suma(f["gas_acue"], f["gas_prop"])
        f["gas_fuente"] = gas_fuente
        f["gas_otros"] = _suma(*[comb[n][i] for n in GAS_OTROS if n in comb])
        f["dies_oil"], f["fuel_oil"], f["carbon"] = comb["Dies_Oil"][i], comb["Fuel_Oil"][i], comb["Carbon"][i]
        filas.append(f)
    return filas


# =============================================================================
# CSV
# =============================================================================
def _fmt(v):
    if v is None or v == "":
        return ""
    if isinstance(v, float):
        return ("%.3f" % v).rstrip("0").rstrip(".")
    return str(v)


def leer_csv(ruta):
    if not Path(ruta).is_file():
        return {}
    with open(ruta, newline="", encoding="utf-8") as f:
        return {r["fecha"]: r for r in csv.DictReader(f)}


def escribir_csv(ruta, por_fecha):
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(ruta.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=COLUMNAS, lineterminator="\n")
            w.writeheader()
            for fecha in sorted(por_fecha):
                w.writerow({c: _fmt(por_fecha[fecha].get(c)) for c in COLUMNAS})
        os.chmod(tmp, 0o644)
        os.replace(tmp, ruta)
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def agregar(por_fecha, filas):
    """Agrega filas; si un dia ya existe, gana la de version mas nueva (a igualdad, la nueva)."""
    for f in filas:
        previa = por_fecha.get(f["fecha"])
        if previa is None or str(f["version"]) >= str(previa.get("version") or ""):
            por_fecha[f["fecha"]] = {c: _fmt(f.get(c)) for c in COLUMNAS}


# =============================================================================
# Origen de los zips: API de CAMMESA o carpeta raw/
# =============================================================================
class Item:
    def __init__(self, nombre, version, publicado, cand=None, ruta=None):
        self.nombre, self.version, self.publicado, self.cand, self.ruta = nombre, version, publicado, cand, ruta


def items_desde_api(hasta, semanas, bloque_dias):
    """Programas semanales que informa la API en las ultimas `semanas` semanas. Devuelve (items, fallas)."""
    items, fallas = {}, []
    desde = hasta - timedelta(days=7 * semanas)
    fin = hasta
    while fin > desde:
        try:
            _, _, docs = psem.listar_documentos(fin, bloque_dias - 1, 0)
            for c in psem.seleccionar(docs, Path("."), incluir_redespacho=False):
                previo = items.get(c.destino.name)
                if previo is None or c.version > previo.version:
                    items[c.destino.name] = Item(c.destino.name, c.version,
                                                 "%s %s" % (c.doc.get("fecha", ""), c.doc.get("hora", "")), cand=c)
        except (psem.ErrorApi, psem.ErrorConfig) as e:
            fallas.append({"programa": "(consulta hasta %s)" % fin, "motivo": str(e)})
        fin -= timedelta(days=bloque_dias)
    return sorted(items.values(), key=lambda i: i.nombre), fallas


def items_desde_raw(carpeta):
    out = []
    for z in sorted(Path(carpeta).glob("*.zip")):
        if not psem.RE_PSEM.match(z.name):
            continue
        meta = {}
        try:
            meta = json.loads(Path(str(z) + ".json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        out.append(Item(z.name.lower(), meta.get("version", ""), meta.get("fecha_publicacion", ""), ruta=z))
    return out


# =============================================================================
# Programa principal
# =============================================================================
def main():
    ap = argparse.ArgumentParser(description="Arma el historial de Programaciones Semanales de CAMMESA.")
    ap.add_argument("--semanas", type=int, default=SEMANAS, help="Semanas hacia atras (por defecto %d)." % SEMANAS)
    ap.add_argument("--hasta", help="Fecha final YYYY-MM-DD (por defecto hoy + 7 dias).")
    ap.add_argument("--hist-dir", default=str(HIST_DIR), help="Carpeta del CSV.")
    ap.add_argument("--bloque-dias", type=int, default=BLOQUE_DIAS)
    ap.add_argument("--pausa", type=float, default=PAUSA, help="Segundos entre descargas.")
    ap.add_argument("--desde-raw", action="store_true", help="No descargar: usar los zips de raw/cammesa_psem/.")
    ap.add_argument("--raw-zips", default=str(RAW_ZIPS))
    ap.add_argument("--guardar-zips", help="Carpeta donde conservar los zips descargados (por defecto no se guardan).")
    ap.add_argument("--tolerante", action="store_true", help="Si CAMMESA falla, avisar y salir con codigo 0.")
    ap.add_argument("--rehacer", action="store_true",
                    help="Volver a leer TODOS los programas y reconstruir el CSV (solo lo reemplaza si queda completo).")
    args = ap.parse_args()

    hist_dir = Path(args.hist_dir)
    csv_path, estado_path = hist_dir / CSV_NAME, hist_dir / ESTADO_NAME
    por_fecha = leer_csv(csv_path)
    previos = {r.get("programa", "").lower() for r in por_fecha.values()}
    try:
        esquema_csv = json.loads(estado_path.read_text(encoding="utf-8")).get("esquema")
    except (OSError, ValueError):
        esquema_csv = None
    if por_fecha and esquema_csv != ESQUEMA and not args.rehacer:
        psem.aviso("El CSV se genero con una version anterior del lector (esquema %s, actual %s): conviene correr con --rehacer"
                   % (esquema_csv, ESQUEMA))
    if args.rehacer:
        conocidos = set()                  # todo vuelve a leerse; el CSV viejo se reemplaza solo si el nuevo queda completo
        csv_viejo, por_fecha = por_fecha, {}
    else:
        csv_viejo = None
        conocidos = {(r.get("programa", "").lower(), r.get("version", "")) for r in por_fecha.values()}
    log("Historial actual: %d dias, %d programas (%s)%s" % (len(csv_viejo if csv_viejo is not None else por_fecha), len(previos), csv_path,
                                                        " | MODO REHACER" if args.rehacer else ""))

    # 1) Que programas hay
    fallas = []
    if args.desde_raw:
        items = items_desde_raw(args.raw_zips)
    else:
        hasta = datetime.strptime(args.hasta, "%Y-%m-%d").date() if args.hasta else datetime.now(psem.ART).date() + timedelta(days=7)
        items, fallas = items_desde_api(hasta, args.semanas, args.bloque_dias)
    log("Programas informados: %d" % len(items))

    # 2) Bajar y leer los que faltan (los mas nuevos primero)
    nuevas = []
    pendientes = [i for i in items if (i.nombre.lower(), i.version) not in conocidos]
    log("Pendientes de leer: %d (ya estaban: %d)" % (len(pendientes), len(items) - len(pendientes)))
    for item in sorted(pendientes, key=lambda i: i.nombre, reverse=True):
        try:
            if item.ruta is not None:
                datos = item.ruta.read_bytes()
            else:
                datos = psem.http_get(psem.url_descarga(item.cand), timeout=120, max_bytes=psem.MAX_DESCARGA_BYTES)
                psem.validar(item.cand, datos)
                if args.guardar_zips:
                    psem.escribir_atomico(Path(args.guardar_zips) / item.nombre, datos)
            filas = filas_de_programa(datos, item.nombre, item.publicado, item.version)
            agregar(por_fecha, filas)
            nuevas.append(item.nombre)
            log("  OK  %-14s semana del %s (%d dias)" % (item.nombre, filas[0]["fecha"], len(filas)))
        except ERRORES_LECTURA as e:
            fallas.append({"programa": item.nombre, "motivo": "%s: %s" % (type(e).__name__, e)})
            psem.aviso("%s: %s: %s" % (item.nombre, type(e).__name__, e))
        if item.ruta is None:
            time.sleep(args.pausa)

    # 3) Guardar CSV y estado
    rehacer_incompleto = bool(args.rehacer and len(nuevas) < len(previos))
    if rehacer_incompleto:
        psem.aviso("La reconstruccion quedo incompleta (%d programas leidos, antes habia %d): NO se reemplazo el CSV. "
                   "Volve a correr con --rehacer." % (len(nuevas), len(previos)))
        por_fecha = csv_viejo
    elif nuevas:
        escribir_csv(csv_path, por_fecha)
    # Version de esquema que queda marcada: un CSV viejo al que solo se le agregaron filas nuevas sigue siendo "viejo".
    if args.rehacer and not rehacer_incompleto:
        esquema_final = ESQUEMA
    elif rehacer_incompleto or (previos and esquema_csv != ESQUEMA):
        esquema_final = esquema_csv
    else:
        esquema_final = ESQUEMA
    fechas = sorted(por_fecha)
    estado = {
        "generado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "csv": CSV_NAME, "esquema": esquema_final,
        "dias": len(fechas), "desde": fechas[0] if fechas else None,
        "hasta": fechas[-1] if fechas else None,
        "programas": len({r.get("programa", "").lower() for r in por_fecha.values()}),
        "programas_nuevos_en_esta_corrida": sorted(nuevas),
        "fallas": fallas,
    }
    hist_dir.mkdir(parents=True, exist_ok=True)
    escribir_estado = json.dumps(estado, indent=2, ensure_ascii=False) + "\n"
    psem.escribir_atomico(estado_path, escribir_estado.encode("utf-8"))

    log("Resultado: %d programas nuevos | %d dias en el CSV (%s -> %s) | fallas: %d"
        % (len(nuevas), len(fechas), estado["desde"], estado["hasta"], len(fallas)))
    if rehacer_incompleto and not args.tolerante:
        return 1
    if fallas and not nuevas and pendientes and not args.tolerante:
        return 1
    if fallas and not items and not args.tolerante:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
