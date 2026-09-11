#!/usr/bin/env python3

import json
import os
from datetime import datetime

import xlrd

BASE_DIR = os.path.dirname(__file__)

RAW_FILE = os.path.join(
    BASE_DIR,
    "..",
    "raw",
    "redespacho.xls"
)

OUT_FILE = os.path.join(
    BASE_DIR,
    "..",
    "public",
    "data",
    "cammesa_redespacho.json"
)


def normalize_date(value, workbook):

    try:
        dt = xlrd.xldate_as_datetime(
            value,
            workbook.datemode
        )

        return dt.date().isoformat()

    except Exception:
        return None


def main():

    wb = xlrd.open_workbook(RAW_FILE)

    sheet = wb.sheet_by_index(0)

    # D19:J19
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
