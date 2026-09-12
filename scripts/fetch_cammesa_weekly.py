#!/usr/bin/env python3

import json
import os
from datetime import date, timedelta, datetime

import requests
import xlrd

BASE_DIR = os.path.dirname(__file__)

OUT_FILE = os.path.join(
    BASE_DIR,
    "..",
    "public",
    "data",
    "cammesa_redespacho.json"
)

API_BASE = "https://api.cammesa.com/pub-svc/public/"
NEMO = "PROGRAMACION_SEMANAL_REDESP"

HDRS = {
    "User-Agent": "Mozilla/5.0 Chrome/130 estado-red-gas"
}


def normalize_date(value, workbook):

    try:
        dt = xlrd.xldate_as_datetime(
            value,
            workbook.datemode
        )

        return dt.date().isoformat()

    except Exception:
        return None


def get_latest_redespacho():

    session = requests.Session()

    today = date.today()
    desde = today - timedelta(days=30)

    params = {
        "nemo": NEMO,
        "fechadesde": f"{desde.isoformat()}T00:00:00",
        "fechahasta": f"{today.isoformat()}T23:59:59",
    }

    r = session.get(
        API_BASE + "findDocumentosByNemoRango",
        params=params,
        headers=HDRS,
        timeout=60
    )

    r.raise_for_status()

    docs = r.json()

    if not docs:
        raise RuntimeError(
            "No se encontraron redespachos CAMMESA"
        )

    docs = sorted(
        docs,
        key=lambda d: datetime.strptime(
            d["fecha"],
            "%d/%m/%Y"
        )
    )

    latest = docs[-1]

    attachment = None

    for a in latest.get("adjuntos", []):

        nombre = (
            a.get("nombre")
            or a.get("id")
            or ""
        )

        if ".xls" in nombre.lower():

            attachment = a
            break

    if not attachment:
        raise RuntimeError(
            "No se encontró redespacho.xls"
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


def main():

    xls_bytes = get_latest_redespacho()

    wb = xlrd.open_workbook(
        file_contents=xls_bytes
    )

    sheet = wb.sheet_by_index(0)

    fechas = []

    for col in range(3, 10):

        fechas.append(
            normalize_date(
                sheet.cell_value(18, col),
                wb
            )
        )

    gas = [
        sheet.cell_value(43, c)
        for c in range(3, 10)
    ]

    go = [
        sheet.cell_value(44, c)
        for c in range(3, 10)
    ]

    fo = [
        sheet.cell_value(45, c)
        for c in range(3, 10)
    ]

    cm = [
        sheet.cell_value(46, c)
        for c in range(3, 10)
    ]

    rows = []

    for i in range(len(fechas)):

        rows.append({
            "fecha": fechas[i],
            "gas_dam3": float(gas[i]),
            "go": float(go[i]),
            "fo": float(fo[i]),
            "cm": float(cm[i]),
            "source": "redespacho"
        })

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

    print(
        f"cammesa_redespacho.json: {len(rows)} rows"
    )


if __name__ == "__main__":
    main()
