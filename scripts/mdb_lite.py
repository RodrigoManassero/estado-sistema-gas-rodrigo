# -*- coding: utf-8 -*-
"""
Lector minimo de bases de datos Microsoft Access (.MDB, formato Jet 4 = Access 2000/2003).

Solo lectura y solo lo necesario para las tablas chicas de CAMMESA (texto, numeros y fechas).
Python puro: no necesita mdbtools, ODBC ni ninguna libreria externa, asi que funciona igual en
Windows y en GitHub Actions.

Uso:
    from mdb_lite import MDB
    db = MDB("psem4326.MDB")            # o MDB(bytes_del_archivo)
    db.tables()                          # nombres de las tablas de usuario
    filas = db.read_table("CONSUMO_COMB")  # lista de dicts {columna: valor}

Limitaciones (se avisa con MDBError, nunca se devuelven datos inventados):
  - solo Jet 4 (.MDB de Access 2000-2003); no .ACCDB ni Jet 3 (Access 97).
  - no decodifica memo/OLE (devuelve None para esas columnas).
  - un puntero de fila invalido se rechaza con error.
"""

import struct
from datetime import datetime, timedelta

PAGE_SIZE = 4096

# Posiciones dentro de la pagina de definicion de tabla (tdef) en Jet 4.
_TAB_NUM_ROWS = 16
_TAB_NUM_COLS = 45
_TAB_NUM_IDXS = 47
_TAB_NUM_RIDXS = 51
_TAB_COLS_START = 63
_RIDX_ENTRY_SIZE = 12
_COL_ENTRY_SIZE = 25

T_BOOL, T_BYTE, T_INT, T_LONG, T_MONEY, T_FLOAT, T_DOUBLE, T_DATETIME = 1, 2, 3, 4, 5, 6, 7, 8
T_TEXT, T_MEMO = 10, 12


class MDBError(Exception):
    pass


def _u16(b, o):
    return struct.unpack_from("<H", b, o)[0]


def _u32(b, o):
    return struct.unpack_from("<I", b, o)[0]


def _decode_text(raw):
    """Texto Jet 4: UTF-16LE, o 'unicode comprimido' (empieza con FF FE) que mezcla ASCII de 1 byte."""
    if raw[:2] == b"\xff\xfe":
        out, i, modo2 = [], 2, False
        while i < len(raw):
            if raw[i] == 0:
                modo2 = not modo2
                i += 1
            elif modo2:
                out.append(raw[i:i + 2].decode("utf-16le", "replace"))
                i += 2
            else:
                out.append(chr(raw[i]))
                i += 1
        return "".join(out)
    return raw.decode("utf-16le", "replace")


class _Col:
    def __init__(self, tipo, col_num, var_num, fixed_off, size, fixed):
        self.tipo, self.col_num, self.var_num = tipo, col_num, var_num
        self.fixed_off, self.size, self.fixed = fixed_off, size, fixed
        self.nombre = None


class MDB:
    def __init__(self, origen):
        """`origen`: ruta del .MDB o su contenido en bytes (por ejemplo leido directo de un zip)."""
        if isinstance(origen, (bytes, bytearray)):
            self.data = bytes(origen)
        else:
            with open(origen, "rb") as f:
                self.data = f.read()
        if len(self.data) < PAGE_SIZE * 3 or len(self.data) % PAGE_SIZE:
            raise MDBError("El archivo no parece una base Access valida (tamano inesperado)")
        if b"Standard Jet DB" not in self.data[:32]:
            raise MDBError("No es una base Jet (.MDB). Los .ACCDB no estan soportados.")
        version = self.data[0x14]
        if version != 1:
            raise MDBError("Version Jet no soportada (%d): solo Access 2000-2003 (Jet 4)" % version)
        self._catalogo = None

    # ---- paginas ---------------------------------------------------------
    def _page(self, n):
        o = n * PAGE_SIZE
        if o + PAGE_SIZE > len(self.data):
            raise MDBError("Pagina %d fuera del archivo" % n)
        return self.data[o:o + PAGE_SIZE]

    def _tdef(self, pagina):
        """Bytes de la definicion de tabla (une las paginas encadenadas)."""
        p = self._page(pagina)
        if p[0] != 0x02:
            raise MDBError("La pagina %d no es una definicion de tabla" % pagina)
        buf, sig = bytearray(p), _u32(p, 4)
        while sig:
            q = self._page(sig)
            buf += q[8:]
            sig = _u32(q, 4)
        return bytes(buf)

    def _columnas(self, tdef):
        n_cols = _u16(tdef, _TAB_NUM_COLS)
        n_ridx = struct.unpack_from("<i", tdef, _TAB_NUM_RIDXS)[0]
        pos = _TAB_COLS_START + _RIDX_ENTRY_SIZE * n_ridx
        cols = []
        for _ in range(n_cols):
            e = tdef[pos:pos + _COL_ENTRY_SIZE]
            c = _Col(tipo=e[0], col_num=_u16(e, 5), var_num=_u16(e, 7), fixed_off=_u16(e, 21),
                     size=_u16(e, 23), fixed=bool(e[15] & 0x01))
            cols.append(c)
            pos += _COL_ENTRY_SIZE
        for c in cols:                      # los nombres siguen a las entradas, en el mismo orden
            largo = _u16(tdef, pos)
            c.nombre = tdef[pos + 2:pos + 2 + largo].decode("utf-16le", "replace")
            pos += 2 + largo
        return cols

    # ---- filas -----------------------------------------------------------
    @staticmethod
    def _limites(p):
        """[(inicio, fin, banderas)] de cada fila de una pagina de datos.

        Las filas no siempre estan ordenadas dentro de la pagina (por ejemplo si una fila se movio o se
        reutilizo espacio), asi que el fin de una fila es el inicio mas cercano que sea mayor al suyo
        entre TODAS las filas de la pagina (incluidas las borradas), o el final de la pagina."""
        entradas = []
        for i in range(_u16(p, 12)):
            bruto = _u16(p, 14 + 2 * i)
            entradas.append((bruto & 0x1FFF, bruto & 0xE000))
        inicios = sorted({ini for ini, _ in entradas})
        siguiente = {ini: (inicios[k + 1] if k + 1 < len(inicios) else PAGE_SIZE) for k, ini in enumerate(inicios)}
        return [(ini, siguiente[ini], banderas) for ini, banderas in entradas]

    def _fila_bytes(self, pagina, fila):
        """Bytes de la fila `fila` de una pagina de datos."""
        p = self._page(pagina)
        if p[0] != 0x01 or fila >= _u16(p, 12):
            raise MDBError("Puntero de fila invalido (pagina %d, fila %d)" % (pagina, fila))
        ini, fin, _ = self._limites(p)[fila]
        return p[ini:fin]

    def _filas_crudas(self, tdef_pagina):
        """Genera los bytes de cada fila viva de las paginas de datos que pertenecen a la tabla.

        Banderas de la tabla de offsets de cada pagina:
          0x8000  fila borrada, o destino de una fila que se movio de pagina (se lee por su puntero)
          0x4000  fila movida: sus primeros 4 bytes apuntan a otra pagina (byte 0 = fila, bytes 1-3 = pagina)
        """
        for n in range(1, len(self.data) // PAGE_SIZE):
            p = self._page(n)
            if p[0] != 0x01 or _u32(p, 4) != tdef_pagina:
                continue
            for ini, fin, banderas in self._limites(p):
                if banderas & 0x8000:
                    continue
                if banderas & 0x4000:
                    # El puntero ocupa los primeros 4 bytes del espacio de la fila; el resto puede ser
                    # sobrante de la fila original (en algunos archivos el hueco conserva su largo viejo).
                    if fin - ini < 4:
                        raise MDBError("Puntero de fila con largo inesperado (%d bytes)" % (fin - ini))
                    puntero = p[ini:ini + 4]
                    yield self._fila_bytes(int.from_bytes(puntero[1:4], "little"), puntero[0])
                else:
                    yield p[ini:fin]

    def _decodificar(self, fila, cols):
        n = _u16(fila, 0)
        nb = (n + 7) // 8
        mascara = fila[len(fila) - nb:]
        # Si la tabla no tiene columnas de largo variable, la fila no trae contador ni tabla de offsets.
        if any(not c.fixed for c in cols):
            n_var = _u16(fila, len(fila) - nb - 2)
            if 2 * (n_var + 1) > len(fila):
                raise MDBError("Fila con cantidad de columnas variables invalida")
            offs = [_u16(fila, len(fila) - nb - 2 - 2 * (i + 1)) for i in range(n_var + 1)]
        else:
            n_var, offs = 0, []
        out = {}
        for c in cols:
            presente = bool(mascara[c.col_num // 8] & (1 << (c.col_num % 8)))
            if c.tipo == T_BOOL:
                out[c.nombre] = presente
                continue
            if not presente:
                out[c.nombre] = None
                continue
            if c.fixed:
                ini = 2 + c.fixed_off
                raw = fila[ini:ini + c.size]
            else:
                if c.var_num >= n_var:
                    out[c.nombre] = None
                    continue
                raw = fila[offs[c.var_num]:offs[c.var_num + 1]]
            out[c.nombre] = self._valor(c.tipo, raw)
        return out

    @staticmethod
    def _valor(tipo, raw):
        try:
            if tipo == T_BYTE:
                return raw[0]
            if tipo == T_INT:
                return struct.unpack("<h", raw[:2])[0]
            if tipo == T_LONG:
                return struct.unpack("<i", raw[:4])[0]
            if tipo == T_FLOAT:
                return struct.unpack("<f", raw[:4])[0]
            if tipo == T_DOUBLE:
                return struct.unpack("<d", raw[:8])[0]
            if tipo == T_MONEY:
                return struct.unpack("<q", raw[:8])[0] / 10000.0
            if tipo == T_DATETIME:
                return datetime(1899, 12, 30) + timedelta(days=struct.unpack("<d", raw[:8])[0])
            if tipo == T_TEXT:
                return _decode_text(raw)
        except struct.error:
            raise MDBError("Valor truncado en una fila")
        return None  # memo, OLE y otros tipos no se decodifican

    def _leer(self, tdef_pagina):
        tdef = self._tdef(tdef_pagina)
        cols = self._columnas(tdef)
        return [self._decodificar(f, cols) for f in self._filas_crudas(tdef_pagina)]

    # ---- API publica -----------------------------------------------------
    def _cargar_catalogo(self):
        if self._catalogo is None:
            cat = {}
            for f in self._leer(2):             # MSysObjects siempre esta en la pagina 2
                if f.get("Type") == 1 and f.get("Name") and not str(f["Name"]).startswith(("MSys", "~")):
                    cat[f["Name"]] = f["Id"] & 0x00FFFFFF
            self._catalogo = cat
        return self._catalogo

    def tables(self):
        return sorted(self._cargar_catalogo())

    def read_table(self, nombre):
        cat = self._cargar_catalogo()
        clave = {k.lower(): k for k in cat}.get(nombre.lower())
        if clave is None:
            raise MDBError("La tabla %r no existe. Tablas: %s" % (nombre, ", ".join(sorted(cat))))
        return self._leer(cat[clave])
