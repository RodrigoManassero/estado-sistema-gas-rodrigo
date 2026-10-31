# -*- coding: utf-8 -*-
"""
Descarga la Programación Semanal de CAMMESA (psemWWYY.zip) a raw/ y la descomprime.

Que hace:
  1. Consulta la API publica de CAMMESA (findDocumentosByNemoRango) por los ultimos N dias.
  2. Para cada zip de programacion semanal que figure y que todavia NO este en raw/, lo descarga.
     Si ya esta (y CAMMESA no lo republico), no vuelve a bajarlo.
  3. Descomprime cada zip en una carpeta propia (raw/cammesa_psem/extraido/<psemWWYY>/).

Modos de uso:
    python scripts/fetch_cammesa_psem.py --listar     # solo muestra que hay y que falta; no descarga
    python scripts/fetch_cammesa_psem.py              # descarga lo que falta y descomprime
    python scripts/fetch_cammesa_psem.py --tolerante  # si CAMMESA no responde, avisa y sale sin error

Solo usa la biblioteca estandar de Python (no hay nada que instalar).
"""

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

# =============================================================================
# CONFIGURACION
# =============================================================================

# >>> MODIFICAR AQUI: carpeta donde se guardan los zips descargados (y sus archivos .json de control). <<<
# Es relativa a donde se ejecuta el script (en GitHub Actions: la raiz del repo).
RAW_DIR = Path("raw/cammesa_psem")

# Subcarpeta de RAW_DIR donde se descomprime cada zip. Conviene ponerla en .gitignore:
# se regenera sola a partir de los zips.
EXTRACT_DIR_NAME = "extraido"

# API publica de CAMMESA. Se puede cambiar con la variable de entorno CAMMESA_API_BASE.
API_BASE = os.environ.get("CAMMESA_API_BASE", "https://api.cammesa.com/pub-svc/public")

# "nemo" que usa el calendario de la pagina: devuelve la programacion semanal y los redespachos.
NEMO_CONSULTA = "PROGRAMACION_SEMANAL_UNIF"

# Cuantos dias hacia atras se consultan. La API devuelve los documentos vigentes en el rango, asi
# que un rango de ~2 semanas permite recuperar un zip que se haya perdido en una corrida anterior.
DIAS_ATRAS = 14

# Los "redespachos semanales" (redespacho.xls) tambien aparecen en la misma consulta.
# Poner True para descargarlos tambien (se guardan con la fecha y hora de publicacion en el nombre,
# porque CAMMESA los publica siempre con el mismo nombre de archivo).
DESCARGAR_REDESPACHO = False

# URL de DESCARGA del archivo: la misma que usa la pagina al apretar el boton del zip
# (observada en DevTools > Red). Se arma con tres datos que devuelve el listado:
#   {attachment_id}  nombre del adjunto, ej. psem4326.zip
#   {doc_id}         identificador largo del documento (docId)
#   {nemo}           el nemo de la consulta (NEMO_CONSULTA), como lo manda la pagina
# Tambien disponibles: {api_base}, {nombre} y {nemo_doc} (el nemo propio del documento).
# Se puede reemplazar con la variable de entorno CAMMESA_DOWNLOAD_TEMPLATE.
DOWNLOAD_URL_TEMPLATE = os.environ.get("CAMMESA_DOWNLOAD_TEMPLATE") or (
    "{api_base}/findAttachmentByNemoId?attachmentId={attachment_id}&docId={doc_id}&nemo={nemo}"
)

# Encabezados extra por si la API los exigiera (hoy no hay evidencia de que haga falta ninguno).
# Ejemplo:  {"Origin": "https://microfe.cammesa.com", "Referer": "https://microfe.cammesa.com/"}
EXTRA_HEADERS = {}

USER_AGENT = "estado-sistema-gas-rodrigo/1.0 (+https://github.com/RodrigoManassero/estado-sistema-gas-rodrigo)"

# Limites de seguridad.
MAX_DESCARGA_BYTES = 100 * 1024 * 1024        # 100 MB por archivo
MAX_ARCHIVOS_ZIP = 500
MAX_DESCOMPRIMIDO_BYTES = 300 * 1024 * 1024   # 300 MB en total por zip

ART = timezone(timedelta(hours=-3))           # Argentina, sin horario de verano
RE_PSEM = re.compile(r"^psem\d{4}\.zip$", re.IGNORECASE)


# =============================================================================
# Errores y mensajes
# =============================================================================
class ErrorApi(Exception):
    """Fallo de red o respuesta inesperada de CAMMESA (recuperable: ver --tolerante)."""


class ErrorConfig(Exception):
    """Falta configurar algo (por ejemplo DOWNLOAD_URL_TEMPLATE)."""


def log(msg):
    print(msg, flush=True)


def aviso(msg):
    prefijo = "::warning::" if os.environ.get("GITHUB_ACTIONS") else "AVISO: "
    print(prefijo + msg, flush=True)


# =============================================================================
# HTTP
# =============================================================================
def http_get(url, timeout, max_bytes, intentos=3):
    """GET con reintentos para fallas de red y errores 5xx. Los 4xx no se reintentan."""
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json, text/plain, */*"}
    headers.update(EXTRA_HEADERS)
    ultimo = None
    for intento in range(1, intentos + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                datos = resp.read(max_bytes + 1)
            if len(datos) > max_bytes:
                raise ErrorApi("La respuesta supera el limite de %d bytes: %s" % (max_bytes, url))
            return datos
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500:
                raise ErrorApi("HTTP %d en %s" % (e.code, url))
            ultimo = "HTTP %d" % e.code
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            ultimo = str(e)
        if intento < intentos:
            time.sleep(2 * intento)
    raise ErrorApi("No se pudo leer %s (%s)" % (url, ultimo))


# =============================================================================
# Consulta a la API
# =============================================================================
def iso_z(d):
    """Medianoche de Argentina en el formato que usa el calendario de CAMMESA (03:00 UTC)."""
    return "%sT03:00:00.000Z" % d.isoformat()


def listar_documentos(hoy, dias_atras):
    desde, hasta = hoy - timedelta(days=dias_atras), hoy
    url = "%s/findDocumentosByNemoRango?fechadesde=%s&fechahasta=%s&nemo=%s" % (
        API_BASE, iso_z(desde), iso_z(hasta), urllib.parse.quote(NEMO_CONSULTA),
    )
    datos = http_get(url, timeout=30, max_bytes=5 * 1024 * 1024)
    try:
        docs = json.loads(datos.decode("utf-8"))
    except ValueError:
        raise ErrorApi("La API no devolvio JSON valido: %r" % datos[:200])
    if not isinstance(docs, list):
        raise ErrorApi("Se esperaba una lista de documentos y llego: %r" % (docs,))
    return desde, hasta, docs


class Candidato:
    """Un archivo de CAMMESA que nos interesa guardar."""

    def __init__(self, doc, adjunto, destino):
        self.doc = doc
        self.adj_id = adjunto.get("id", "")
        self.nombre = adjunto.get("nombre", self.adj_id)
        self.destino = destino
        self.es_zip = destino.suffix.lower() == ".zip"

    @property
    def version(self):
        return self.doc.get("version") or ""

    @property
    def meta_path(self):
        return self.destino.with_name(self.destino.name + ".json")


def _fecha_hora_doc(doc):
    """('2026-10-23', '1738') a partir de fecha 'dd/mm/yyyy' y hora 'hh:mm'; None si no se puede."""
    try:
        d = datetime.strptime(doc["fecha"], "%d/%m/%Y").date().isoformat()
        h = datetime.strptime(doc["hora"], "%H:%M").strftime("%H%M")
        return d, h
    except (KeyError, ValueError, TypeError):
        return None


def seleccionar(docs, raw_dir, incluir_redespacho):
    """Elige los archivos a guardar y su ruta de destino. Si dos documentos caen en la misma
    ruta se queda con el de version mas reciente."""
    elegidos = {}
    for doc in docs:
        nemo = doc.get("nemo")
        for adj in doc.get("adjuntos") or []:
            nombre = adj.get("nombre") or adj.get("id") or ""
            destino = None
            if nemo == "PROGRAMACION_SEMANAL" and RE_PSEM.match(nombre):
                destino = raw_dir / nombre.lower()
            elif incluir_redespacho and nemo == "PROGRAMACION_SEMANAL_REDESP" and nombre.lower().endswith((".xls", ".xlsx")):
                fh = _fecha_hora_doc(doc)
                sello = "%s_%s" % fh if fh else str(doc.get("id", "sin-id"))
                ext = Path(nombre).suffix.lower()
                destino = raw_dir / "redespacho" / ("redespacho_%s%s" % (sello, ext))
            if destino is None:
                continue
            cand = Candidato(doc, adj, destino)
            previo = elegidos.get(destino)
            if previo is None or cand.version > previo.version:
                elegidos[destino] = cand
    return sorted(elegidos.values(), key=lambda c: (c.version, c.destino.name))


# =============================================================================
# Estado en raw/, descarga y validacion
# =============================================================================
def leer_meta(c):
    try:
        return json.loads(c.meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def estado(c):
    """'falta' | 'al_dia' | 'sin_control' (esta el archivo pero no su .json) | 'republicado'."""
    if not c.destino.is_file():
        return "falta"
    meta = leer_meta(c)
    if meta is None:
        return "sin_control"
    if meta.get("version") and c.version and meta["version"] != c.version:
        return "republicado"
    return "al_dia"


def url_descarga(c):
    if not DOWNLOAD_URL_TEMPLATE:
        raise ErrorConfig(
            "DOWNLOAD_URL_TEMPLATE esta vacia: falta la URL de descarga de los archivos de CAMMESA."
        )
    q = lambda s: urllib.parse.quote(str(s), safe="")
    return DOWNLOAD_URL_TEMPLATE.format(
        api_base=API_BASE, doc_id=q(c.doc.get("id", "")), attachment_id=q(c.adj_id),
        nemo=q(NEMO_CONSULTA), nemo_doc=q(c.doc.get("nemo", "")), nombre=q(c.nombre),
    )


def validar(c, datos):
    """Rechaza respuestas que no son el archivo esperado (por ejemplo una pagina de error con 200)."""
    if not datos:
        raise ErrorApi("%s: la descarga llego vacia" % c.nombre)
    if c.es_zip:
        if not zipfile.is_zipfile(io.BytesIO(datos)):
            raise ErrorApi("%s: no es un zip valido (empieza con %r)" % (c.nombre, datos[:60]))
        with zipfile.ZipFile(io.BytesIO(datos)) as z:
            malo = z.testzip()
            if malo:
                raise ErrorApi("%s: zip corrupto (archivo %s)" % (c.nombre, malo))
            _plan(z, c.nombre)   # rutas y tamanos seguros, antes de guardar nada
    else:
        if not (datos.startswith(b"\xd0\xcf\x11\xe0") or datos.startswith(b"PK")):
            raise ErrorApi("%s: no parece un Excel (empieza con %r)" % (c.nombre, datos[:60]))


def escribir_atomico(destino, datos):
    destino.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(destino.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(datos)
        os.chmod(tmp, 0o644)
        os.replace(tmp, destino)
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def escribir_meta(c, datos_bytes, verificado):
    meta = {
        "doc_id": c.doc.get("id"),
        "nemo": c.doc.get("nemo"),
        "version": c.version,
        "fecha_publicacion": "%s %s" % (c.doc.get("fecha", ""), c.doc.get("hora", "")),
        "archivo_origen": c.nombre,
        "tamano_bytes": len(datos_bytes) if datos_bytes is not None else c.destino.stat().st_size,
        "sha256": hashlib.sha256(datos_bytes).hexdigest() if datos_bytes is not None else None,
        "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "verificado_contra_version": verificado,
    }
    escribir_atomico(c.meta_path, (json.dumps(meta, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def descargar(c):
    datos = http_get(url_descarga(c), timeout=120, max_bytes=MAX_DESCARGA_BYTES)
    validar(c, datos)
    escribir_atomico(c.destino, datos)
    escribir_meta(c, datos, verificado=True)
    return len(datos)


# =============================================================================
# Descompresion segura
# =============================================================================
def _plan(z, nombre):
    """Lista (nombre, tamano) de los archivos del zip, validando limites y rutas."""
    infos = [i for i in z.infolist() if not i.is_dir()]
    if len(infos) > MAX_ARCHIVOS_ZIP:
        raise ErrorApi("%s tiene demasiados archivos (%d)" % (nombre, len(infos)))
    if sum(i.file_size for i in infos) > MAX_DESCOMPRIMIDO_BYTES:
        raise ErrorApi("%s se descomprimiria a mas de %d MB" % (nombre, MAX_DESCOMPRIMIDO_BYTES // 2**20))
    for i in infos:
        p = Path(i.filename)
        if p.is_absolute() or ".." in p.parts or "\\" in i.filename:
            raise ErrorApi("%s: ruta insegura dentro del zip (%s)" % (nombre, i.filename))
    return [(i.filename, i.file_size) for i in infos]


def extraer(zip_path, carpeta):
    """Descomprime en `carpeta` si no esta completa. Devuelve (cantidad_de_archivos, hizo_algo)."""
    with zipfile.ZipFile(zip_path) as z:
        plan = _plan(z, zip_path.name)
    completa = carpeta.is_dir() and all(
        (carpeta / n).is_file() and (carpeta / n).stat().st_size == t for n, t in plan
    )
    if completa:
        return len(plan), False
    carpeta.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(dir=str(carpeta.parent), prefix=".tmp_"))
    try:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(tmp)
        if carpeta.exists():
            shutil.rmtree(carpeta)
        os.replace(tmp, carpeta)
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return len(plan), True


# =============================================================================
# Programa principal
# =============================================================================
def sincronizar(raw_dir, dias_atras=DIAS_ATRAS, incluir_redespacho=False, extraer_zips=True,
                solo_listar=False, hoy=None):
    """Consulta CAMMESA y descarga lo que falta en raw_dir. Devuelve la cantidad de archivos con error.
    Lanza ErrorApi si no se puede consultar la API y ErrorConfig si falta configuracion."""
    hoy = hoy or datetime.now(ART).date()
    desde, hasta, docs = listar_documentos(hoy, dias_atras)
    cands = seleccionar(docs, raw_dir, incluir_redespacho)
    log("Consulta CAMMESA: %s -> %s (hora Argentina) | documentos: %d | archivos de interes: %d"
        % (desde, hasta, len(docs), len(cands)))

    if solo_listar:
        for c in cands:
            nombre = c.destino.relative_to(raw_dir) if raw_dir in c.destino.parents else c.destino.name
            log("  %-34s publicado %s %s | %s" % (nombre, c.doc.get("fecha", "?"), c.doc.get("hora", ""), estado(c)))
        return 0

    errores = 0
    for c in cands:
        st = estado(c)
        nombre = c.destino.name
        try:
            if st == "falta" or st == "republicado":
                n = descargar(c)
                log("  %-34s %s -> descargado (%d bytes)" % (nombre, st, n))
            elif st == "sin_control":
                escribir_meta(c, None, verificado=False)
                log("  %-34s ya estaba en raw (sin archivo de control): no se vuelve a bajar" % nombre)
            else:
                log("  %-34s ya estaba en raw: no se vuelve a bajar" % nombre)

            if c.es_zip and extraer_zips:
                cantidad, hizo = extraer(c.destino, raw_dir / EXTRACT_DIR_NAME / c.destino.stem)
                log("  %-34s %s (%d archivos)" % ("", "descomprimido" if hizo else "carpeta ya completa", cantidad))
        except ErrorApi as e:
            errores += 1
            aviso("%s: %s" % (nombre, e))
    return errores


def main():
    ap = argparse.ArgumentParser(description="Descarga y descomprime la Programacion Semanal de CAMMESA.")
    ap.add_argument("--raw-dir", help="Carpeta de destino (por defecto RAW_DIR).")
    ap.add_argument("--dias-atras", type=int, default=DIAS_ATRAS, help="Dias a consultar hacia atras.")
    ap.add_argument("--listar", action="store_true", help="Solo mostrar que hay y que falta; no descarga.")
    ap.add_argument("--sin-extraer", action="store_true", help="No descomprimir los zips.")
    ap.add_argument("--redespacho", action="store_true", help="Incluir tambien los redespachos semanales (xls).")
    ap.add_argument("--tolerante", action="store_true", help="Si CAMMESA falla, avisar y salir con codigo 0.")
    args = ap.parse_args()

    raw_dir = Path(args.raw_dir) if args.raw_dir else RAW_DIR
    try:
        errores = sincronizar(raw_dir, args.dias_atras, DESCARGAR_REDESPACHO or args.redespacho,
                              extraer_zips=not args.sin_extraer, solo_listar=args.listar)
        return 1 if errores and not args.tolerante else 0
    except ErrorConfig as e:
        print("ERROR de configuracion: %s" % e, file=sys.stderr)
        return 2
    except ErrorApi as e:
        if args.tolerante:
            aviso("No se pudo consultar CAMMESA: %s" % e)
            return 0
        print("ERROR: %s" % e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
