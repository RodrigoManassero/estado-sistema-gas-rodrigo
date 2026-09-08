#!/usr/bin/env python3
"""Ingest files dropped into raw/incoming/ and route them to raw/.

Usage: drop ENARGAS/CAMMESA PDFs, linepack Excel, or the base Excel into
raw/incoming/ and this script moves them to raw/ with the expected name.
Unknown files are left in place and reported.
"""

import os
import re
import shutil
import sys
from datetime import datetime, timezone

# Metadata files living in incoming/ that should be ignored.
IGNORE = {'README.md', 'readme.md', '.gitkeep'}

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
INCOMING_DIR = os.path.join(RAW_DIR, 'incoming')
ARCHIVE_DIR = os.path.join(RAW_DIR, 'incoming', '_archive')


def read_head(path, n=8):
    with open(path, 'rb') as f:
        return f.read(n)


def is_pdf(head):
    return head[:5] == b'%PDF-'


def is_xlsx(head):
    # XLSX is a ZIP file — "PK\x03\x04"
    return head[:4] == b'PK\x03\x04'


def classify(fname, head):
    """Return (dest_basename, description) or (None, reason)."""
    lower = fname.lower()

    if lower.endswith('.pdf') and is_pdf(head):
        if re.match(r'^etgs', lower):
            return fname, 'ENARGAS TGS daily report'
        if re.match(r'^ps_\d{8}', lower):
            return fname, 'CAMMESA weekly projection'
        # Unknown PDF — keep name but warn
        return fname, 'unknown PDF (kept, but no parser matches)'

    if lower.endswith('.xlsx') and is_xlsx(head):
        if 'linepack' in lower:
            return fname, 'Linepack equilibrium Excel'
        if 'base reporte' in lower or 'base_reporte' in lower:
            return 'Base Reporte Estado de Sistema.xlsx', 'Base Reporte (overwrites master)'
        return fname, 'unknown Excel (kept, but no parser matches)'

    return None, f"unrecognized file (head={head[:6]!r})"


def main():
    os.makedirs(INCOMING_DIR, exist_ok=True)

    entries = [e for e in os.listdir(INCOMING_DIR)
               if os.path.isfile(os.path.join(INCOMING_DIR, e))
               and not e.startswith('.')
               and e not in IGNORE]

    if not entries:
        print("ingest_incoming: no files in raw/incoming/")
        return 0

    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')

    moved = 0
    warnings = 0
    for fname in entries:
        src = os.path.join(INCOMING_DIR, fname)
        try:
            head = read_head(src)
        except OSError as e:
            print(f"  SKIP {fname}: cannot read ({e})", file=sys.stderr)
            warnings += 1
            continue

        dest_name, description = classify(fname, head)
        if dest_name is None:
            print(f"  SKIP {fname}: {description}", file=sys.stderr)
            warnings += 1
            continue

        dest = os.path.join(RAW_DIR, dest_name)

        # Keep a copy in _archive for audit, then move to raw/
        archive_name = f"{stamp}__{fname}"
        shutil.copy2(src, os.path.join(ARCHIVE_DIR, archive_name))
        shutil.move(src, dest)
        print(f"  OK   {fname} -> raw/{dest_name}  ({description})")
        moved += 1

    print(f"ingest_incoming: {moved} ingested, {warnings} warnings")
    return 0 if warnings == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
