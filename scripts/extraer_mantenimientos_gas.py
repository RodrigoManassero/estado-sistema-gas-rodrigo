# -*- coding: utf-8 -*-
"""
Extractor del Excel de mantenimientos de sistemas de gas (CCO - SE - Cammesa).

Lee el Excel (valores, comentarios de celda y colores de relleno) y genera un
JSON ordenado con:
  - metadata y advertencias,
  - la lista de dias cubiertos por el Excel,
  - "tabla_mantenimientos": lista PLANA, una fila por mantenimiento, lista para
    mostrar en una tabla de front end (ordenada por fecha),
  - por cuenca: series diarias por actor, eventos de mantenimiento (reconstruidos
    a partir de los comentarios) y el resumen diario de restricciones.

Genera DOS archivos en cada corrida (siempre desde cero, sobrescribiendo los anteriores;
no se conserva ningun dato de corridas pasadas):
  1. Archivo para el front end (OUTPUT_DIR / OUTPUT_FILENAME): liviano, con el mismo "sobre"
     que usan los demas JSON del repo {generated_at, source, source_date, data}. Contiene
     la tabla de mantenimientos, el impacto diario por categoria y las advertencias.
  2. Archivo completo (OUTPUT_DIR_COMPLETO / OUTPUT_FILENAME_COMPLETO), opcional: incluye
     ademas las series diarias y los eventos por cuenca. Es para uso local/analisis y NO
     esta pensado para publicarse.

Uso:
    python extraer_mantenimientos_gas.py
    python extraer_mantenimientos_gas.py --excel "D:\\otra\\ruta\\archivo.xlsx" --salida "D:\\otra\\carpeta"
"""

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path

import openpyxl

# =============================================================================
# CONFIGURACION  -  ESTAS SON LAS DOS RUTAS QUE TENES QUE MODIFICAR
# =============================================================================

# >>> MODIFICAR AQUI: ruta COMPLETA del Excel de entrada (carpeta + nombre). <<<
EXCEL_PATH = Path(__file__).resolve().parent.parent / "raw" / "CCO.xlsx"

# >>> MODIFICAR AQUI: CARPETA donde se guarda el JSON para el front end. <<<
# En el repo de la pagina es la carpeta public/data. Si no existe se crea. El archivo se
# llama siempre igual y se sobrescribe en cada corrida.
OUTPUT_DIR = Path(r"C:\Mantenimientos\salida\public\data")

# Nombre del JSON liviano para el front end (dentro de OUTPUT_DIR).
OUTPUT_FILENAME = "mantenimientos.json"

# >>> MODIFICAR AQUI (opcional): CARPETA del JSON completo (series + eventos por cuenca). <<<
# Poner None para no generarlo. NO apuntar a una carpeta que se publique.
OUTPUT_DIR_COMPLETO = Path(__file__).resolve().parent.parent / "public" / "data"

# Nombre del JSON completo (dentro de OUTPUT_DIR_COMPLETO).
OUTPUT_FILENAME_COMPLETO = "mantenimientos_gas_completo.json"

# Texto que se informa como "source" en el sobre del JSON del front end.
FUENTE_NOMBRE = "Programa de mantenimientos CCO (Excel manual)"

# Si es True, "tabla_mantenimientos" incluye solo los mantenimientos que terminan
# hoy o despues (los ya finalizados se omiten). Las series y eventos por cuenca
# siguen completos. Si es False, la tabla incluye todos los eventos del Excel y el
# front end puede filtrar por fecha_hasta >= hoy.
TABLA_FILTRAR_DESDE_HOY = False

# =============================================================================
# Parametros de la estructura del Excel (cambiar solo si cambia el formato)
# =============================================================================
SHEET_NAME = None          # None = primera hoja del libro
ROW_MES = 1                # fila con el mes (celda combinada con fecha del dia 1)
ROW_DIA = 2                # fila con el numero de dia (1..31)
ROW_DIA_SEMANA = 3         # fila con el dia de la semana (Jue, Vie, ...)
COL_EMPRESA = 1            # A
COL_TIPO = 2               # B  (Capacidad de Transporte / Disponibilidad / Impacto Real)
COL_CUENCA = 3             # C  (nombre de la cuenca, combinado a lo largo del bloque)
COL_PRIMER_DIA = 4         # D
UNIDAD = "MM m3/d"         # segun los comentarios del Excel
VALOR_MAXIMO_RAZONABLE = 1000  # un valor diario mayor se considera error del Excel

SUMMARY_LABELS = {
    "restr. transporte": "restr_transporte",
    "restr. inyeccion": "restr_inyeccion",
    "restr. iny real": "restr_iny_real",
    "restriccion efectiva": "restr_efectiva",
}

DIAS_SEMANA_OK = {"lun", "mar", "mie", "jue", "vie", "sab", "dom"}

# =============================================================================
# REGLAS DE SISTEMA Y GASODUCTO  -  EDITAR AQUI PARA AFINAR EL FILTRO DE LA TABLA
# =============================================================================
# El Excel no tiene una columna de gasoducto. Cada mantenimiento recibe:
#   - "sistema":   se deduce de la fila del Excel: TGN, TGS, Enarsa (gasoducto tomado del
#                  nombre de la fila, ej. "Enarsa - Gasoducto GPM" -> GPM), Productores
#                  (filas de inyeccion) o Demanda y otros (CAMMESA, MEGA, etc.).
#   - "gasoducto": solo para TGN y TGS, con las reglas de abajo (la primera que coincide gana).
#                  Si ninguna coincide queda en null y el filtro lo muestra como "Sin especificar".
#
# Cada regla es (transportista, patron, gasoducto). El patron se busca en "instalacion + tarea".
# Los patrones distinguen mayusculas, salvo los que empiezan con (?i).
#
# Origen de las reglas: el mapa "Gasoductos troncales de la Republica Argentina" (Energia Argentina),
# donde cada planta compresora esta sobre la traza de su transportista (azul = TGN, rojo = TGS).
# Para agregar una planta nueva, sumar su nombre al patron del gasoducto que corresponda.
GASODUCTO_REGLAS = [
    # --- TGS ---
    # El Excel nombra "Gto NII", "Gtos NI y NII", "Loop NII" en filas de TGS.
    ("TGS", r"\bNII?\b", "Neuba I/II"),
    # Plantas sobre el corredor Neuba I y II (Neuquen -> Gral. Cerri -> Saturno/Ordoqui/Barker).
    ("TGS", r"(?i)cervantes|chelfor[oó]|belisl[eé]|fort[ií]n|gaviotas|la adela|cerri|indio rico|barker"
            r"|olavarr[ií]a|ordoqui|saturno|buchanan", "Neuba I/II"),
    # Plantas del Gasoducto San Martin (Rio Colorado hacia el sur hasta Tierra del Fuego).
    ("TGS", r"(?i)r[ií]o colorado|general conesa|san antonio oeste|bajo del gualicho|dolav[oó]n|garayalde"
            r"|manantiales behr|pico truncado|bosque petrificado|r[ií]o seco|san juli[aá]n|piedrabuena"
            r"|moy aike|magallanes|san sebasti[aá]n", "San Martín"),
    # --- TGN ---
    # Plantas del Gasoducto Centro Oeste segun el mapa. "LLL" (Loma La Lata) sale de textos del Excel
    # como "Gto paralelo LLL - Catriel": ese caso NO figura en el mapa, queda como suposicion a confirmar.
    ("TGN", r"(?i)cochic[oó]|beazley|la carlota|la mora|puel[eé]n|la paz|chaj[aá]n|baldiss?era|\blll\b",
     "Centro Oeste"),
    # Plantas del Gasoducto Norte segun el mapa (no aparecen en el Excel actual).
    ("TGN", r"(?i)campo dur[aá]n|cornejo|pichanal|miraflores|lumbreras|candelaria|tucum[aá]n|lavalle|recreo"
            r"|de[aá]n funes|ferreyra|t[ií]o pujio|leones|gasoducto norte|gto\.? norte", "Norte"),
]


# =============================================================================
# Utilidades
# =============================================================================
def limpiar(texto):
    """Texto de etiqueta: sin espacios raros, saltos de linea ni dobles espacios."""
    if texto is None:
        return None
    t = str(texto).replace("\xa0", " ").replace("\n", " ")
    t = re.sub(r"\s+", " ", t).strip()
    return t or None


def sin_acentos(texto):
    tabla = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
    return texto.translate(tabla)


def normalizar_clave(texto):
    return sin_acentos(limpiar(texto) or "").lower()


def slug(texto):
    s = re.sub(r"[^a-z0-9]+", "-", normalizar_clave(texto)).strip("-")
    return s or "sin-nombre"


def a_numero(valor):
    """Devuelve float redondeado, o None si la celda no es numerica (ej. '\\xa0')."""
    if isinstance(valor, bool) or valor is None:
        return None
    if isinstance(valor, (int, float)):
        return round(float(valor), 6)
    return None


def color_de_relleno(celda):
    """Codigo del color de relleno ('FFFF00', 'theme4/0.80') o None si no tiene."""
    relleno = celda.fill
    if relleno is None or not relleno.fill_type:
        return None
    fg = relleno.fgColor
    if fg is None:
        return None
    if fg.type == "rgb" and isinstance(fg.rgb, str):
        return fg.rgb[-6:]
    if fg.type == "theme":
        return "theme%s/%.2f" % (fg.theme, fg.tint or 0)
    if fg.type == "indexed":
        return "indexed%s" % fg.indexed
    return None


def limpiar_comentario(texto):
    lineas = [re.sub(r"[ \t\xa0]+", " ", l).strip() for l in texto.replace("\r", "").split("\n")]
    # quita lineas vacias al principio/final y colapsa vacias repetidas
    while lineas and not lineas[0]:
        lineas.pop(0)
    while lineas and not lineas[-1]:
        lineas.pop()
    salida = []
    for l in lineas:
        if l or (salida and salida[-1]):
            salida.append(l)
    return "\n".join(salida)


def clave_de_evento(texto):
    """Clave para agrupar dias consecutivos del mismo evento: las primeras 3 lineas."""
    lineas = [normalizar_clave(l) for l in texto.split("\n") if l.strip()]
    return " | ".join(lineas[:3])


def _a_float(s):
    return round(float(s.replace(",", ".")), 6)


def _campos_bloque(lineas):
    """(empresa_origen, lugar, descripcion) de un bloque de lineas de comentario."""
    empresa_origen = None
    resto = lineas
    if lineas and lineas[0].endswith(":"):
        empresa_origen = lineas[0].rstrip(":").strip()
        resto = lineas[1:]
    lugar = resto[0] if resto else None
    descripcion = resto[1:] if len(resto) > 1 else []
    return empresa_origen, lugar, descripcion


def parsear_comentario(texto):
    """Extrae campos utiles del texto libre del comentario (el texto crudo se conserva)."""
    bloques_txt = [b for b in re.split(r"\n\s*\n", texto) if b.strip()]
    bloques = []
    for b in bloques_txt:
        lineas_b = [l for l in b.split("\n") if l.strip()]
        emp_b, lugar_b, desc_b = _campos_bloque(lineas_b)
        bloques.append({
            "titulo": lineas_b[0] if lineas_b else None,
            "detalle": lineas_b[1:],
            "empresa_origen": emp_b,
            "lugar": lugar_b,
            "descripcion": desc_b,
        })

    lineas = [l for l in texto.split("\n") if l.strip()]
    empresa_origen, lugar, descripcion = _campos_bloque(lineas)

    impactos = [_a_float(m) for m in re.findall(r"(-?\d+(?:[.,]\d+)?)\s*MM", texto, flags=re.I)]
    m_dur = re.search(r"(\d+(?:[.,]\d+)?)\s*(d[ií]as?|hs|horas?)\b", texto, flags=re.I)
    return {
        "empresa_origen": empresa_origen,
        "lugar": lugar,
        "descripcion": descripcion,
        "duracion_mencionada": m_dur.group(0) if m_dur else None,
        "impactos_mencionados_mm3d": impactos,
        "multiples_bloques": len(bloques) > 1,
        "bloques": bloques,
    }


# =============================================================================
# Lectura del Excel
# =============================================================================
class Lector:
    def __init__(self, ruta):
        # Dos lecturas: formulas/comentarios/colores (wb_f) y valores calculados (wb_v)
        self.wb_f = openpyxl.load_workbook(ruta)
        self.wb_v = openpyxl.load_workbook(ruta, data_only=True)
        nombre = SHEET_NAME or self.wb_f.sheetnames[0]
        self.hoja_f = self.wb_f[nombre]
        self.hoja_v = self.wb_v[nombre]
        self.nombre_hoja = nombre
        self.advertencias = []
        self.comentarios_procesados = set()
        self.anomalas = set()   # (fila, col) con valor imposible en el Excel
        self.columnas = {}      # col -> {"fecha": date, "dia_semana": str}
        self.cols_orden = []

    def warn(self, msg):
        self.advertencias.append(msg)

    def val(self, fila, col):
        return self.hoja_v.cell(fila, col).value

    # ---- dias --------------------------------------------------------------
    def leer_dias(self):
        hv = self.hoja_v
        # columnas de meses: celdas con fecha en la fila de meses
        inicios = []
        for c in range(COL_PRIMER_DIA, hv.max_column + 1):
            v = self.val(ROW_MES, c)
            if isinstance(v, datetime):
                inicios.append((c, v))
        if not inicios:
            raise ValueError("No encontre fechas de mes en la fila %d." % ROW_MES)

        # ultima columna con numero de dia
        ultima = COL_PRIMER_DIA
        for c in range(COL_PRIMER_DIA, hv.max_column + 1):
            if isinstance(self.val(ROW_DIA, c), (int, float)):
                ultima = c

        for i, (c0, mes) in enumerate(inicios):
            c1 = (inicios[i + 1][0] - 1) if i + 1 < len(inicios) else ultima
            for c in range(c0, c1 + 1):
                dia = self.val(ROW_DIA, c)
                if not isinstance(dia, (int, float)):
                    self.warn("Columna %s sin numero de dia en fila %d." % (openpyxl.utils.get_column_letter(c), ROW_DIA))
                    continue
                try:
                    fecha = mes.replace(day=int(dia)).date()
                except ValueError:
                    self.warn("Dia invalido (%s) en columna %s." % (dia, openpyxl.utils.get_column_letter(c)))
                    continue
                ds = self.val(ROW_DIA_SEMANA, c)
                self.columnas[c] = {"fecha": fecha, "dia_semana": limpiar(ds) if isinstance(ds, str) else None}
        self.cols_orden = sorted(self.columnas)
        # control de continuidad de fechas
        fechas = [self.columnas[c]["fecha"] for c in self.cols_orden]
        for a, b in zip(fechas, fechas[1:]):
            if (b - a).days != 1:
                self.warn("Salto de fechas entre %s y %s." % (a, b))

    # ---- bloques (cuencas) -------------------------------------------------
    def detectar_bloques(self):
        hf = self.hoja_f
        inicios = []
        for r in range(1, hf.max_row + 1):
            nombre = limpiar(hf.cell(r, COL_CUENCA).value)
            if nombre and normalizar_clave(nombre) != "mes / dia":
                inicios.append((r, nombre))
        bloques = []
        for i, (r0, nombre) in enumerate(inicios):
            r1 = (inicios[i + 1][0] - 1) if i + 1 < len(inicios) else hf.max_row
            # el bloque termina en su ultima fila con empresa (se descartan los encabezados del siguiente)
            while r1 > r0 and normalizar_clave(limpiar(hf.cell(r1, COL_EMPRESA).value) or "") in ("", "empresa"):
                r1 -= 1
            bloques.append((nombre, r0, r1))
        return bloques

    # ---- series y eventos --------------------------------------------------
    def serie_de_fila(self, fila):
        """Lista de (col, valor) para todas las columnas de dias."""
        out = {}
        for c in self.cols_orden:
            v = self.val(fila, c)
            n = a_numero(v)
            if n is not None and abs(n) > VALOR_MAXIMO_RAZONABLE:
                self.warn(
                    "Valor anomalo %s en %s%d (%s): se informa como null. Revisar formula del Excel."
                    % (n, openpyxl.utils.get_column_letter(c), fila, self.columnas[c]["fecha"])
                )
                self.anomalas.add((fila, c))
                n = None
            out[c] = n
        return out

    def eventos_de_fila(self, fila, valores):
        """Reconstruye eventos agrupando dias consecutivos con el mismo comentario."""
        hf = self.hoja_f
        celdas = []  # (col, texto, autor, color)
        for c in self.cols_orden:
            celda = hf.cell(fila, c)
            if celda.comment and celda.comment.text and celda.comment.text.strip():
                texto = limpiar_comentario(celda.comment.text)
                celdas.append((c, texto, celda.comment.author, color_de_relleno(celda)))
                self.comentarios_procesados.add(celda.coordinate)

        grupos = []
        for item in celdas:
            c, texto, autor, color = item
            clave = clave_de_evento(texto)
            if grupos and grupos[-1]["ultima_col"] == c - 1 and grupos[-1]["clave"] == clave:
                g = grupos[-1]
                g["ultima_col"] = c
                g["items"].append(item)
            else:
                grupos.append({"clave": clave, "ultima_col": c, "items": [item]})

        eventos = []
        for g in grupos:
            items = g["items"]
            textos = []
            for _, t, _, _ in items:
                if t not in textos:
                    textos.append(t)
            autores = sorted({a for _, _, a, _ in items if a})
            colores = sorted({col for _, _, _, col in items if col})
            detalle = []
            for c, _, _, _ in items:
                detalle.append({
                    "fecha": self.columnas[c]["fecha"].isoformat(),
                    "celda": "%s%d" % (openpyxl.utils.get_column_letter(c), fila),
                    "valor": valores.get(c),
                })
            vals = [d["valor"] for d in detalle if d["valor"] is not None]
            parsed = parsear_comentario(textos[0])
            eventos.append({
                "fecha_desde": detalle[0]["fecha"],
                "fecha_hasta": detalle[-1]["fecha"],
                "dias": len(detalle),
                "empresa_origen": parsed["empresa_origen"],
                "lugar": parsed["lugar"],
                "descripcion": parsed["descripcion"],
                "duracion_mencionada": parsed["duracion_mencionada"],
                "impactos_mencionados_mm3d": parsed["impactos_mencionados_mm3d"],
                "multiples_bloques": parsed["multiples_bloques"],
                "bloques": parsed["bloques"],
                "impacto_min": min(vals) if vals else None,
                "impacto_max": max(vals) if vals else None,
                "sin_impacto": bool(vals) and all(v == 0 for v in vals),
                "autores": autores,
                "colores": colores,
                "comentario_raw": textos[0],
                "comentarios_distintos": textos if len(textos) > 1 else [],
                "detalle_diario": detalle,
            })
        return eventos

    def armar_actor(self, empresa, tipo_fila, fila_base, fila_impacto, es_simple, cuenca_slug):
        fila_valores = fila_impacto if fila_impacto else fila_base
        valores_imp = self.serie_de_fila(fila_valores) if fila_valores else {}
        valores_cap = self.serie_de_fila(fila_base) if (fila_base and not es_simple and fila_impacto) else {}
        hf = self.hoja_f

        serie = []
        dias_sin_comentario = []
        for c in self.cols_orden:
            fecha = self.columnas[c]["fecha"].isoformat()
            tiene_com = bool(hf.cell(fila_valores, c).comment) if fila_valores else False
            if es_simple:
                registro = {"fecha": fecha, "valor": valores_imp.get(c), "comentario": tiene_com}
            else:
                registro = {
                    "fecha": fecha,
                    "capacidad": valores_cap.get(c),
                    "impacto": valores_imp.get(c),
                    "comentario": tiene_com,
                }
            serie.append(registro)
            v = valores_imp.get(c)
            if not es_simple and v not in (None, 0) and not tiene_com:
                dias_sin_comentario.append(fecha)

        actor = {
            "id": "%s:%s:f%d" % (cuenca_slug, slug(empresa), fila_valores or fila_base),
            "empresa": empresa,
            "tipo_fila": tipo_fila,
            "filas_excel": {"base": fila_base, "impacto": fila_impacto},
            "serie": serie,
            "eventos": self.eventos_de_fila(fila_valores, valores_imp) if fila_valores else [],
        }
        if dias_sin_comentario:
            actor["dias_con_impacto_sin_comentario"] = dias_sin_comentario
        return actor

    def procesar_bloque(self, nombre, r0, r1):
        hf = self.hoja_f
        cuenca_slug = slug(nombre)
        actores, resumen_filas = [], {}
        r = r0
        while r <= r1:
            a = limpiar(hf.cell(r, COL_EMPRESA).value)
            b = limpiar(hf.cell(r, COL_TIPO).value)
            if a is None or normalizar_clave(a) == "empresa":
                r += 1
                continue
            clave_a = normalizar_clave(a)
            clave_b = normalizar_clave(b) if b else ""

            if clave_a in SUMMARY_LABELS:
                resumen_filas[SUMMARY_LABELS[clave_a]] = r
                r += 1
            elif clave_b.startswith("capacidad") or clave_b.startswith("disponibilidad"):
                fila_imp = None
                if r + 1 <= r1:
                    a2 = limpiar(hf.cell(r + 1, COL_EMPRESA).value)
                    b2 = normalizar_clave(limpiar(hf.cell(r + 1, COL_TIPO).value) or "")
                    if a2 is None and b2.startswith("impacto"):
                        fila_imp = r + 1
                if fila_imp is None:
                    self.warn("Fila %d (%s): no encontre su fila de 'Impacto Real'." % (r, a))
                actores.append(self.armar_actor(a, b, r, fila_imp, False, cuenca_slug))
                r += 2 if fila_imp else 1
            elif clave_b.startswith("impacto"):
                # fila de impacto sin fila de capacidad propia (ej. ASIST TGS / TGN en Norte)
                actores.append(self.armar_actor(a, b, None, r, True, cuenca_slug))
                r += 1
            else:
                # fila suelta (ALUAR, CAMMESA, EXPO ..., MEGA, etc.)
                actores.append(self.armar_actor(a, "Fila simple", r, None, True, cuenca_slug))
                r += 1

        resumen = []
        series_res = {k: self.serie_de_fila(f) for k, f in resumen_filas.items()}
        for c in self.cols_orden:
            reg = {"fecha": self.columnas[c]["fecha"].isoformat()}
            for k in ("restr_transporte", "restr_inyeccion", "restr_iny_real", "restr_efectiva"):
                if k in series_res:
                    reg[k] = series_res[k].get(c)
            # La restriccion efectiva del Excel es el minimo entre transporte e inyeccion:
            # si el valor de transporte es anomalo, el resultado tampoco es confiable.
            f_tr = resumen_filas.get("restr_transporte")
            if f_tr and (f_tr, c) in self.anomalas and "restr_efectiva" in reg:
                reg["restr_efectiva"] = None
                self.warn("Restriccion efectiva de %s (%s) informada como null: depende de un valor anomalo de transporte."
                          % (nombre, self.columnas[c]["fecha"]))
            resumen.append(reg)

        return {
            "nombre": nombre,
            "filas_excel": {"desde": r0, "hasta": r1},
            "actores": actores,
            "resumen_diario": resumen,
        }

    def verificar_comentarios_huerfanos(self):
        """Avisa si quedo algun comentario del Excel sin incluir en el JSON."""
        for fila in self.hoja_f.iter_rows(min_col=COL_PRIMER_DIA):
            for celda in fila:
                if celda.comment and celda.coordinate not in self.comentarios_procesados:
                    self.warn("Comentario no incluido en %s (fila no procesada o fuera del rango de dias)." % celda.coordinate)

    def extraer(self):
        self.leer_dias()
        bloques = self.detectar_bloques()
        cuencas = [self.procesar_bloque(*b) for b in bloques]
        self.verificar_comentarios_huerfanos()
        return cuencas


# =============================================================================
# Tabla plana de mantenimientos (una fila por evento)
# =============================================================================
_RE_LINEA_NO_TAREA = re.compile(
    r"^(sin\s+)?impacto\b|^duraci[oó]n\b|^\d+(?:[.,]\d+)?\s*(d[ií]as?|hs|horas?)\.?$", re.I
)


def categoria_de(tipo_fila):
    """Transporte / Inyeccion (productores) / Demanda y otros, segun el tipo de fila del Excel."""
    t = normalizar_clave(tipo_fila or "")
    if t.startswith("capacidad") or t.startswith("impacto"):
        return "Transporte"
    if t.startswith("disponibilidad"):
        return "Inyección (productores)"
    return "Demanda, generación y otros"


def categoria_key_de(tipo_fila):
    """Clave estable (sin tildes) de la categoria, para usar en el front end."""
    t = normalizar_clave(tipo_fila or "")
    if t.startswith("capacidad") or t.startswith("impacto"):
        return "transporte"
    if t.startswith("disponibilidad"):
        return "inyeccion"
    return "otros"


def fmt_num(x, con_signo=False):
    """Numero con coma decimal (max. 2 decimales): -2 -> '-2', -1.49 -> '-1,49'."""
    s = ("%.2f" % x).rstrip("0").rstrip(".")
    if s in ("-0", ""):
        s = "0"
    if con_signo and x > 0:
        s = "+" + s
    return s.replace(".", ",")


def describir_impacto(vmin, vmax):
    """(texto para la tabla, signo) a partir del impacto minimo y maximo del evento."""
    if vmin is None or vmax is None:
        return "Sin dato en el Excel", "sin_dato"
    if vmin == 0 and vmax == 0:
        return "Sin impacto", "cero"
    if vmin == vmax:
        return fmt_num(vmin, True), ("negativo" if vmin < 0 else "positivo")
    texto = "%s a %s" % (fmt_num(vmin, True), fmt_num(vmax, True))
    if vmin < 0 < vmax:
        signo = "mixto"
    elif vmax <= 0:
        signo = "negativo"
    else:
        signo = "positivo"
    return texto, signo


def tarea_de(descripcion):
    """Descripcion sin las lineas que solo indican duracion o impacto."""
    lineas = [l for l in descripcion if not _RE_LINEA_NO_TAREA.match(l.strip())]
    return " / ".join(lineas) if lineas else None


def clasificar_sistema(empresa, categoria_key, instalacion, tarea):
    """(sistema, gasoducto) de un mantenimiento. Ver GASODUCTO_REGLAS."""
    emp = (empresa or "").strip()
    texto = " ".join(x for x in (instalacion, tarea) if x)
    up = emp.upper()
    if up in ("TGN", "TGS"):
        for transportista, patron, gasoducto in GASODUCTO_REGLAS:
            if transportista == up and re.search(patron, texto):
                return up, gasoducto
        return up, None
    if up.startswith("ENARSA"):
        m = re.search(r"gasoducto\s+(.+)$", emp, flags=re.I)
        return "Enarsa", (m.group(1).strip() if m else None)
    if categoria_key == "inyeccion":
        return "Productores", None
    return "Demanda y otros", None


def construir_tabla(cuencas, solo_desde=None):
    """Lista plana: una fila por mantenimiento, ordenada por fecha. solo_desde: date o None."""
    filas = []
    for cu in cuencas:
        for actor in cu["actores"]:
            for ev in actor["eventos"]:
                if solo_desde and ev["fecha_hasta"] < solo_desde.isoformat():
                    continue
                bloques = ev["bloques"]
                if ev["multiples_bloques"] and len(bloques) > 1:
                    lugares = []
                    for b in bloques:
                        if b["lugar"] and b["lugar"] not in lugares:
                            lugares.append(b["lugar"])
                    instalacion = " + ".join(lugares) or ev["lugar"]
                    tareas = [tarea_de(b["descripcion"]) for b in bloques]
                    tarea = " // ".join(t for t in tareas if t) or None
                else:
                    instalacion = ev["lugar"]
                    tarea = tarea_de(ev["descripcion"])

                texto_imp, signo = describir_impacto(ev["impacto_min"], ev["impacto_max"])
                detalle = ev["detalle_diario"]
                cat_key = categoria_key_de(actor["tipo_fila"])
                sistema, gasoducto = clasificar_sistema(actor["empresa"], cat_key, instalacion, tarea)
                filas.append({
                    "id": "%s:%s" % (actor["id"], ev["fecha_desde"]),
                    "fecha_desde": ev["fecha_desde"],
                    "fecha_hasta": ev["fecha_hasta"],
                    "dias": ev["dias"],
                    "cuenca": cu["nombre"],
                    "empresa": actor["empresa"],
                    "categoria": categoria_de(actor["tipo_fila"]),
                    "categoria_key": cat_key,
                    "sistema": sistema,
                    "gasoducto": gasoducto,
                    "instalacion": instalacion,
                    "tarea": tarea,
                    "impacto_texto": texto_imp,
                    "impacto_min": ev["impacto_min"],
                    "impacto_max": ev["impacto_max"],
                    "signo_impacto": signo,
                    "sin_impacto": ev["sin_impacto"],
                    "unidad": UNIDAD,
                    "impactos_en_comentario_mm3d": ev["impactos_mencionados_mm3d"],
                    "duracion_mencionada": ev["duracion_mencionada"],
                    "multiples_trabajos": ev["multiples_bloques"],
                    "texto_variable_durante_evento": bool(ev["comentarios_distintos"]),
                    "color": ev["colores"][0] if len(ev["colores"]) == 1 else (ev["colores"] or None),
                    "autores": ev["autores"],
                    "celda_desde": detalle[0]["celda"],
                    "celda_hasta": detalle[-1]["celda"],
                    "comentario_raw": ev["comentario_raw"],
                })
    filas.sort(key=lambda f: (f["fecha_desde"], f["fecha_hasta"], f["cuenca"], f["empresa"]))
    return filas


# =============================================================================
# Impacto diario por categoria (para graficos y tarjetas del front end)
# =============================================================================
def construir_impacto_diario(cuencas, fechas):
    """Suma por dia el impacto de los EVENTOS (celdas con comentario).

    reduccion_*: suma de impactos negativos, en valor absoluto (MM m3/d).
    aumento_total: suma de impactos positivos (ej. CAMMESA).
    Las filas sueltas sin comentario (demanda/exportaciones constantes) no se suman.
    """
    dias = {
        f.isoformat(): {
            "fecha": f.isoformat(),
            "eventos_activos": 0,
            "reduccion_transporte": 0.0,
            "reduccion_inyeccion": 0.0,
            "reduccion_otros": 0.0,
            "aumento_total": 0.0,
        }
        for f in fechas
    }
    for cu in cuencas:
        for actor in cu["actores"]:
            key = categoria_key_de(actor["tipo_fila"])
            for ev in actor["eventos"]:
                for d in ev["detalle_diario"]:
                    reg = dias.get(d["fecha"])
                    if reg is None:
                        continue
                    reg["eventos_activos"] += 1
                    v = d["valor"]
                    if v is None or v == 0:
                        continue
                    if v < 0:
                        reg["reduccion_" + key] += -v
                    else:
                        reg["aumento_total"] += v
    out = []
    for iso in sorted(dias):
        reg = dias[iso]
        for k in ("reduccion_transporte", "reduccion_inyeccion", "reduccion_otros", "aumento_total"):
            reg[k] = round(reg[k], 4)
        out.append(reg)
    return out


def escribir_json(carpeta, nombre, objeto):
    """Escribe en un temporal y reemplaza: la corrida anterior se pisa por completo."""
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = carpeta / nombre
    fd, tmp = tempfile.mkstemp(suffix=".json", dir=str(carpeta))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(objeto, f, ensure_ascii=False, indent=2)
        os.chmod(tmp, 0o644)  # mkstemp crea el archivo con permisos 0600
        os.replace(tmp, destino)
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    return destino


# =============================================================================
# Programa principal
# =============================================================================
def main():
    parser = argparse.ArgumentParser(description="Extrae el Excel de mantenimientos de gas a JSON.")
    parser.add_argument("--excel", help="Ruta del Excel (si se omite se usa EXCEL_PATH).")
    parser.add_argument("--salida", help="Carpeta del JSON para el front end (si se omite se usa OUTPUT_DIR).")
    parser.add_argument("--salida-completo", help="Carpeta del JSON completo (si se omite se usa OUTPUT_DIR_COMPLETO).")
    parser.add_argument("--sin-completo", action="store_true", help="No generar el JSON completo.")
    args = parser.parse_args()

    ruta_excel = Path(args.excel) if args.excel else EXCEL_PATH
    carpeta_salida = Path(args.salida) if args.salida else OUTPUT_DIR
    if args.sin_completo:
        carpeta_completo = None
    elif args.salida_completo:
        carpeta_completo = Path(args.salida_completo)
    else:
        carpeta_completo = OUTPUT_DIR_COMPLETO

    if not ruta_excel.is_file():
        sys.exit("No encuentro el Excel en: %s\nModifica EXCEL_PATH al inicio del script." % ruta_excel)

    lector = Lector(ruta_excel)
    cuencas = lector.extraer()

    fechas = [lector.columnas[c]["fecha"] for c in lector.cols_orden]
    total_eventos = sum(len(a["eventos"]) for cu in cuencas for a in cu["actores"])
    hoy = datetime.now().date()
    tabla = construir_tabla(cuencas, hoy if TABLA_FILTRAR_DESDE_HOY else None)
    total_com_excel = sum(
        1 for fila in lector.hoja_f.iter_rows(min_col=COL_PRIMER_DIA) for c in fila if c.comment
    )

    ahora = datetime.now().astimezone()
    metadata = {
        "archivo_origen": ruta_excel.name,
        "hoja": lector.nombre_hoja,
        "generado_en": ahora.isoformat(timespec="seconds"),
        "fecha_desde": fechas[0].isoformat(),
        "fecha_hasta": fechas[-1].isoformat(),
        "cantidad_dias": len(fechas),
        "unidad": UNIDAD,
        "cantidad_cuencas": len(cuencas),
        "cantidad_eventos": total_eventos,
        "comentarios_en_excel": total_com_excel,
        "filas_tabla_mantenimientos": len(tabla),
        "tabla_filtrada_desde_hoy": TABLA_FILTRAR_DESDE_HOY,
    }
    impacto_diario = construir_impacto_diario(cuencas, fechas)

    # 1) JSON liviano para el front end, con el sobre {generated_at, source, source_date, data}
    fecha_archivo = datetime.fromtimestamp(ruta_excel.stat().st_mtime).date().isoformat()
    para_front = {
        "generated_at": ahora.isoformat(timespec="seconds"),
        "source": FUENTE_NOMBRE,
        "source_date": fecha_archivo,
        "data": {
            "metadata": metadata,
            "tabla": tabla,
            "impacto_diario": impacto_diario,
            "advertencias": lector.advertencias,
        },
    }
    destino = escribir_json(carpeta_salida, OUTPUT_FILENAME, para_front)

    # 2) JSON completo (opcional): series diarias y eventos por cuenca
    destino_completo = None
    if carpeta_completo is not None:
        completo = {
            "metadata": metadata,
            "advertencias": lector.advertencias,
            "dias": [
                {"fecha": lector.columnas[c]["fecha"].isoformat(), "dia_semana": lector.columnas[c]["dia_semana"]}
                for c in lector.cols_orden
            ],
            "tabla_mantenimientos": tabla,
            "impacto_diario": impacto_diario,
            "cuencas": cuencas,
        }
        destino_completo = escribir_json(carpeta_completo, OUTPUT_FILENAME_COMPLETO, completo)

    sin_gto = sorted({(f["empresa"], f["instalacion"] or "(sin texto)") for f in tabla
                      if f["sistema"] in ("TGN", "TGS") and not f["gasoducto"]})
    if sin_gto:
        print("TGN/TGS sin gasoducto asignado (editar GASODUCTO_REGLAS si corresponde): %d instalaciones" % len(sin_gto))
        for emp, inst in sin_gto[:15]:
            print("  - %s | %s" % (emp, inst[:70]))
    print("JSON para el front end: %s" % destino)
    if destino_completo:
        print("JSON completo:          %s" % destino_completo)
    print("Dias: %d (%s -> %s) | Cuencas: %d | Eventos: %d | Filas de la tabla: %d | Comentarios en Excel: %d | Advertencias: %d"
          % (len(fechas), fechas[0], fechas[-1], len(cuencas), total_eventos, len(tabla), total_com_excel, len(lector.advertencias)))
    for w in lector.advertencias[:20]:
        print("  [!] " + w)
    if len(lector.advertencias) > 20:
        print("  ... y %d advertencias mas (ver 'advertencias' en el JSON)." % (len(lector.advertencias) - 20))


if __name__ == "__main__":
    main()
