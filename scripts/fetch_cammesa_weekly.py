#!/usr/bin/env python3

import json
import os

from openpyxl import load_workbook

BASE_DIR = os.path.dirname(__file__)

RAW_FILE = os.path.join(
    BASE_DIR,
    "..",
    "raw",
    "info_weekly.xlsx"
)

OUT_FILE = os.path.join(
    BASE_DIR,
    "..",
    "public",
    "data",
    "cammesa_weekly.json"
)


def main():

    wb = load_workbook(
        RAW_FILE,
        data_only=True
    )

    ws = wb.active

    headers = []

    # fila 1
    for col in range(2, ws.max_column + 1):

        value = ws.cell(
            row=1,
            column=col
        ).value

        headers.append(str(value))

    combustibles = {}

    for row in range(2, ws.max_row + 1):

        nombre = ws.cell(
            row=row,
            column=1
        ).value

        combustibles[str(nombre)] = []

        for col in range(2, ws.max_column + 1):

            combustibles[str(nombre)].append(
                ws.cell(
                    row=row,
                    column=col
                ).value or 0
            )

    rows = []

    for i, fecha in enumerate(headers):

        rows.append({
            "fecha": fecha,
            "gas_dam3": float(
                combustibles["Gas"][i]
            ),
            "go": float(
                combustibles["Dies_Oil"][i]
            ),
            "fo": float(
                combustibles["Fuel_Oil"][i]
            ),
            "cm": float(
                combustibles["Carbon"][i]
            ),
            "source": "weekly"
        })

    with open(
        OUT_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            rows,
            f,
            indent=2,
            ensure_ascii=False
        )

    print(
        f"cammesa_weekly.json: {len(rows)} rows"
    )


if __name__ == "__main__":
    main()
