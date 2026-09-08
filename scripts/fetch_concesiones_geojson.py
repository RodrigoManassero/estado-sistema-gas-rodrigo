#!/usr/bin/env python3
"""Fetch hydrocarbon concession polygons from Secretaría de Energía.

Source: datos.energia.gob.ar — "Producción de hidrocarburos - Concesiones
de Explotación" (package 81cfad0a-4162-4f85-ad71-837f5a5fae57). The dataset
publishes a national shapefile (~600 KB) covering ~300 concession polygons
across every basin.

We filter to Cuenca Neuquina by geographic bounding box (the most reliable
join since the shapefile lacks a "cuenca" attribute) and write a GeoJSON
FeatureCollection ready for the dashboard map.

Schema of each Feature:
  properties: { id, nombre, operador, interesados, participacion, comentario }
  geometry:   MultiPolygon in EPSG:4326

Output:
  public/data/concesiones_neuquina.geojson

This is a slow-moving dataset (concessions change shape rarely). Designed
as a manual one-shot — NOT wired into build_data.py. Re-run when SE
publishes a new version (last_modified field on the resource).

Usage:
  python scripts/fetch_concesiones_geojson.py
"""

import io
import json
import os
import sys
import tempfile
import time
import zipfile

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import shapefile  # pyshp
except ImportError:
    print("Install pyshp first: pip install pyshp", file=sys.stderr)
    sys.exit(1)

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
OUT_PATH = os.path.join(OUT_DIR, 'concesiones_neuquina.geojson')

DATASET_ID = '81cfad0a-4162-4f85-ad71-837f5a5fae57'
RESOURCE_ID = '48a306a3-d5da-4f28-8ab5-7f80767ffdec'
SHP_URL = (
    f'http://datos.energia.gob.ar/dataset/{DATASET_ID}/resource/'
    f'{RESOURCE_ID}/download/produccin-hidrocarburos-concesiones-de-explotacin.zip'
)

# Cuenca Neuquina bounding box (lon, lat) — generous to catch border blocks.
# Sources: IAPG basin maps; double-checked against known blocks.
NEUQUINA_BBOX = {
    'lon_min': -71.5,
    'lon_max': -67.0,
    'lat_min': -41.0,
    'lat_max': -33.5,
}

HDRS = {'User-Agent': 'Mozilla/5.0 Chrome/130 estado-red-gas'}


def in_neuquina(lon: float, lat: float) -> bool:
    return (NEUQUINA_BBOX['lon_min'] <= lon <= NEUQUINA_BBOX['lon_max']
            and NEUQUINA_BBOX['lat_min'] <= lat <= NEUQUINA_BBOX['lat_max'])


def shape_to_multipolygon(shape) -> dict:
    """Convert a pyshp Polygon shape into a GeoJSON MultiPolygon geometry.

    pyshp polygons have flat `parts` indices into `points`. Each part is a
    ring (outer or hole). Most concession polygons have a single outer ring,
    but a few are multi-part — we wrap each part as its own polygon to keep
    the geometry valid regardless.
    """
    parts = list(shape.parts) + [len(shape.points)]
    polygons = []
    for i in range(len(parts) - 1):
        ring = [list(p) for p in shape.points[parts[i]:parts[i + 1]]]
        if len(ring) >= 3:
            # GeoJSON polygons are [[[outer ring], [hole], ...]]; we don't
            # detect holes here — pyshp doesn't tag winding direction. Each
            # part becomes its own polygon, which renders identically.
            polygons.append([ring])
    return {'type': 'MultiPolygon', 'coordinates': polygons}


def centroid(points) -> tuple[float, float]:
    """Quick averaging centroid — good enough for bounding-box membership."""
    if not points:
        return 0.0, 0.0
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f'Downloading {SHP_URL}')
    # CKAN gives intermittent 504s; back off and retry a few times.
    session = requests.Session()
    retry = Retry(total=5, backoff_factor=2.0, status_forcelist=(500, 502, 503, 504),
                  allowed_methods=frozenset(['GET']))
    session.mount('http://', HTTPAdapter(max_retries=retry))
    session.mount('https://', HTTPAdapter(max_retries=retry))
    r = session.get(SHP_URL, headers=HDRS, timeout=300)
    r.raise_for_status()
    print(f'  {len(r.content):,} bytes')
    # quiet linters that don't see time used elsewhere
    _ = time

    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            z.extractall(tmp)
        shp_path = next(
            (os.path.join(tmp, f) for f in os.listdir(tmp) if f.lower().endswith('.shp')),
            None,
        )
        if not shp_path:
            print('ERROR: no .shp inside the zip', file=sys.stderr)
            sys.exit(1)

        # Force UTF-8 reads of the DBF — the shapefile says cp1252 in .cpg
        # but the strings actually contain accented characters that decode
        # cleanly as utf-8 (verified empirically).
        sf = shapefile.Reader(shp_path, encoding='utf-8')

        # On Windows the DBF/SHP file handles stay open until close() is
        # called; the tempdir context tries to delete them while pyshp still
        # holds them and raises PermissionError. Read everything we need,
        # then close before the tempdir tears down.

        field_names = [f[0] for f in sf.fields[1:]]
        # Field name index lookup tolerant of pyshp's trailing-underscore
        # truncation ("NOMBRE_DE_AR..." → "NOMBRE_DE_").
        def idx(prefix: str) -> int:
            for i, name in enumerate(field_names):
                if name.startswith(prefix):
                    return i
            raise KeyError(prefix)

        i_nombre = idx('NOMBRE_DE')
        i_codigo = idx('CODIGO_DE')
        i_op = idx('EMPRESA_OP')
        i_in = idx('EMPRESA_IN')
        i_part = idx('PARTICIPAC')
        i_com = idx('COMENTARIO')

        features = []
        total = 0
        for shape, rec in zip(sf.shapes(), sf.records()):
            total += 1
            if not shape.points:
                continue
            cx, cy = centroid(shape.points)
            if not in_neuquina(cx, cy):
                continue
            features.append({
                'type': 'Feature',
                'properties': {
                    'id': str(rec[i_codigo]).strip(),
                    'nombre': str(rec[i_nombre]).strip(),
                    'operador': str(rec[i_op]).strip(),
                    'interesados': str(rec[i_in]).strip(),
                    'participacion': str(rec[i_part]).strip(),
                    'comentario': str(rec[i_com]).strip(),
                },
                'geometry': shape_to_multipolygon(shape),
            })

        print(f'  total polygons in dataset: {total}')
        print(f'  Neuquina (bbox-filtered):  {len(features)}')

        sf.close()

    fc = {
        'type': 'FeatureCollection',
        'crs': {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:OGC:1.3:CRS84'}},
        'features': features,
        'metadata': {
            'source': 'Secretaria de Energia - Concesiones de Explotacion',
            'source_url': f'https://datos.energia.gob.ar/dataset/{DATASET_ID}',
            'filter': f'bbox lon[{NEUQUINA_BBOX["lon_min"]},{NEUQUINA_BBOX["lon_max"]}] '
                      f'lat[{NEUQUINA_BBOX["lat_min"]},{NEUQUINA_BBOX["lat_max"]}]',
        },
    }
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(fc, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f'\n{OUT_PATH}  ({size_kb:.0f} KB)')

    by_op = {}
    for feat in features:
        op = feat['properties']['operador']
        by_op[op] = by_op.get(op, 0) + 1
    print('\nTop operadores en Neuquina:')
    for k, v in sorted(by_op.items(), key=lambda x: -x[1])[:10]:
        print(f'  {v:3d}  {k}')


if __name__ == '__main__':
    main()
