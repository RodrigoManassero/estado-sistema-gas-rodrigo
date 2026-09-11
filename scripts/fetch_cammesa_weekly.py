#!/usr/bin/env python3

import io
import json
import os
import zipfile
from datetime import date, datetime, timedelta

import pyodbc
import requests

BASE_DIR = os.path.dirname(__file__)

OUT_FILE = os.path.join(
    BASE_DIR,
    "..",
    "public",
    "data",
    "cammesa_weekly.json"
)

API_BASE = "https://api.cammesa.com/pub-svc/public/"
NEMO = "PROGRAMACION_SEMANAL"

HDRS = {
    "User-Agent": "Mozilla/5.0 Chrome/130 estado-red-gas"
}


def get_latest_psem():

    session = requests.Session()

    today = date.today()

    days_until_next_monday = (7 - today.weekday()) % 7

    if days_until_next_monday == 0:
        days_until_next_monday = 7

    next_monday = today + timedelta(days=days_until_next_monday)

    params = {
        "nemo": NEMO,
        "fechadesde": f"{next_monday.isoformat()}T00:00:00",
        "fechahasta": f"{next_monday.isoformat()}T23:59:59",
    }

    r = session.get(
        API_BASE + "findDocumentosByNemoRango",
        params=params,
        headers=HDRS,
        timeout=60
    )

    r.raise_for_status()

    docs = r.json()

    psem_docs = [
        d for d in docs
        if d.get("nemo") == "PROGRAMACION_SEMANAL"
    ]

    if not psem_docs:
        raise RuntimeError(
            "No se encontraron documentos PSEM"
        )

    psem_docs = sorted(
        psem_docs,
        key=lambda d: datetime.strptime(
            d["fecha"],
            "%d/%m/%Y"
        )
    )

    latest = psem_docs[-1]

    attachment = None

    for a in latest.get("adjuntos", []):

        nombre = (
            a.get("nombre")
            or a.get("id")
            or ""
        )

        if nombre.lower().endswith(".zip"):
            attachment = a
            break

    if not attachment:
        raise RuntimeError(
            "No se encontró ZIP semanal CAMMESA"
        )

    attachment_id = (
        attachment.get("id")
        or attachment.get("nombre")
    )

    rr = session.get(
        API_BASE + "findAttachmentByNemoId",
        params={
            "attachmentId": attachment_id,
            "docId": latest["id"],
            "nemo": NEMO,
        },
        headers=HDRS,
        timeout=120,
    )

    rr.raise_for_status()

    return rr.content


def extract_mdb(zip_bytes):

    z = zipfile.ZipFile(io.BytesIO(zip_bytes))

    mdb_name = None

    for f in z.namelist():

        if f.lower().endswith(".mdb"):
            mdb_name = f
            break

    if not mdb_name:
        raise RuntimeError(
            "MDB no encontrado en ZIP"
        )

    tmp_path = os.path.join(
        BASE_DIR,
        "_tmp_psem.mdb"
    )

    with open(tmp_path, "wb") as f:
        f.write(z.read(mdb_name))

    return tmp_path


def build_rows(mdb_path):

    conn = pyodbc.connect(
        rf"Driver={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={mdb_path};"
    )

    cursor = conn.cursor()

    cursor.execute("SELECT * FROM FECHA")

    fecha_row = cursor.fetchone()

    inicio = fecha_row[0].date()

    cursor.execute("SELECT * FROM CONSUMO_COMB")

    raw = cursor.fetchall()

    data = {}

    for row in raw:

        combustible = row[0]

        data[combustible] = list(row[1:8])

    rows = []

    for i in range(7):

        fecha = (
            inicio + timedelta(days=i)
        ).isoformat()

        gas = (
            float(data["GasAcue"][i])
            +
            float(data["GasProp"][i])
        )

        rows.append({
            "fecha": fecha,
            "gas_dam3": gas,
            "go": float(data["Dies_Oil"][i]),
            "fo": float(data["Fuel_Oil"][i]),
            "cm": float(data["Carbon"][i]),
            "source": "psem"
        })

    return rows


def main():

    zip_bytes = get_latest_psem()

    mdb_path = extract_mdb(zip_bytes)

    rows = build_rows(mdb_path)

    with open(
        OUT_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            rows,
            f,
            ensure_ascii=False,
            indent=2
        )

    os.remove(mdb_path)

    print(
        f"cammesa_weekly.json: {len(rows)} rows"
    )


if __name__ == "__main__":
    main()
