#!/usr/bin/env node
/**
 * Build provincias.geojson — one feature per Argentine province, for the
 * gas-consumption choropleth (ProvinciasMap).
 *
 * Input:  polymaps provincias.json (EPSG:4326). Source:
 *         https://raw.githubusercontent.com/jazzido/Polymaps-Argentina/master/provincias.json
 *         Same dataset build_distribuidoras_geojson.cjs uses; point POLYMAPS_PROV
 *         at a local copy (default: %TEMP%/polymaps_prov.json).
 * Output: public/data/provincias.geojson (EPSG:3857, one MultiPolygon per provincia)
 *
 * Each feature carries { id: <slug>, name: <display>, area_km2 }. The slug MUST
 * match scripts/fetch_enargas_provincias.py's province_slug() so the frontend can
 * join consumption rows to polygons. area_km2 is computed on the raw EPSG:4326
 * rings with a local equirectangular projection (like CuencaMap.polygonAreaKm2) —
 * Mercator area is badly distorted across Argentina's latitude span, so we never
 * derive area from the projected coords.
 *
 * Geometry is static: build once and commit. Not part of the nightly pipeline.
 */

const fs = require('fs');
const path = require('path');

const INPUT = process.env.POLYMAPS_PROV ||
  'C:/Users/mpodeley/AppData/Local/Temp/polymaps_prov.json';
const OUTPUT = path.join(
  'C:/Users/mpodeley/Documents/projects/estado_del_sistema',
  'public/data/provincias.geojson'
);
const TOL_DEG = 0.02; // Douglas-Peucker tolerance in degrees (~2 km)

// Pretty display names (Spanish accents) keyed by slug.
const DISPLAY = {
  buenos_aires: 'Buenos Aires', caba: 'CABA', catamarca: 'Catamarca',
  cordoba: 'Córdoba', corrientes: 'Corrientes', chaco: 'Chaco', chubut: 'Chubut',
  entre_rios: 'Entre Ríos', formosa: 'Formosa', jujuy: 'Jujuy', la_pampa: 'La Pampa',
  la_rioja: 'La Rioja', mendoza: 'Mendoza', misiones: 'Misiones', neuquen: 'Neuquén',
  rio_negro: 'Río Negro', salta: 'Salta', san_juan: 'San Juan', san_luis: 'San Luis',
  santa_cruz: 'Santa Cruz', santa_fe: 'Santa Fe', santiago_del_estero: 'Santiago del Estero',
  tierra_del_fuego: 'Tierra del Fuego', tucuman: 'Tucumán',
};

// Must mirror fetch_enargas_provincias.py::province_slug.
function slugify(name) {
  let s = (name || '').trim().toLowerCase();
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  if (['capital federal', 'ciudad de buenos aires', 'caba'].includes(s)) return 'caba';
  return s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// ---- Douglas-Peucker (degrees) ----
function sqSegDist(p, a, b) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}
function simplifyDP(points, tol) {
  const n = points.length;
  if (n < 3) return points.slice();
  const tol2 = tol * tol;
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0, index = 0;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i], points[first], points[last]);
      if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD > tol2) { keep[index] = 1; stack.push([first, index]); stack.push([index, last]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}
function simplifyRing(ring, tol) {
  let s = simplifyDP(ring, tol);
  if (s.length < 4) return null;
  const f = s[0], l = s[s.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) s.push([f[0], f[1]]);
  return s;
}

// ---- EPSG:4326 -> EPSG:3857 ----
const R = 6378137.0;
function project([lon, lat]) {
  const x = R * (lon * Math.PI / 180);
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 360)));
  return [Math.round(x), Math.round(y)];
}

// ---- area helpers ----
function ringArea(ring) { // signed shoelace, input units²
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}
function topNRings(rings, n) {
  return rings.map(r => ({ r, a: ringArea(r) })).sort((x, y) => y.a - x.a).slice(0, n).map(x => x.r);
}
// km² via local equirectangular projection at the ring's mean latitude.
function ringAreaKm2(ring) {
  const earthR = 6378.137; // km
  if (ring.length < 3) return 0;
  const meanLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);
  const pts = ring.map(([lon, lat]) => ({
    x: ((lon * Math.PI) / 180) * earthR * cosLat,
    y: ((lat * Math.PI) / 180) * earthR,
  }));
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) a += pts[i].x * pts[i + 1].y - pts[i + 1].x * pts[i].y;
  return Math.abs(a) / 2;
}

// ---- load + group rings per province (outer rings only) ----
const src = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const provRings = {}; // slug -> array of 4326 rings
for (const feat of src.features) {
  const slug = slugify(feat.properties.provincia);
  const geom = feat.geometry;
  let rings = [];
  if (geom.type === 'Polygon') rings = geom.coordinates;
  else if (geom.type === 'MultiPolygon') for (const poly of geom.coordinates) rings.push(poly[0]);
  (provRings[slug] = provRings[slug] || []).push(...rings);
}
// Drop tiny islets that bloat TdF / Entre Ríos.
if (provRings.tierra_del_fuego) provRings.tierra_del_fuego = topNRings(provRings.tierra_del_fuego, 2);
if (provRings.entre_rios) provRings.entre_rios = topNRings(provRings.entre_rios, 1);

// ---- assemble GeoJSON ----
const features = [];
for (const slug of Object.keys(provRings).sort()) {
  const rings4326 = provRings[slug];
  const areaKm2 = rings4326.reduce((s, r) => s + ringAreaKm2(r), 0);
  const projected = [];
  for (const r of rings4326) {
    const s = simplifyRing(r, TOL_DEG);
    if (s) projected.push(s.map(project));
  }
  if (!projected.length) { console.warn('No geometry for', slug); continue; }
  features.push({
    type: 'Feature',
    properties: { id: slug, name: DISPLAY[slug] || slug, area_km2: Math.round(areaKm2) },
    geometry: { type: 'MultiPolygon', coordinates: projected.map(r => [r]) },
  });
}

const geojson = {
  type: 'FeatureCollection',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3857' } },
  features,
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(geojson));

const sz = fs.statSync(OUTPUT).size;
console.log('Wrote', OUTPUT, '\nSize:', (sz / 1024).toFixed(1) + ' KB', '| Features:', features.length);
for (const f of features) {
  console.log('  ', f.properties.id.padEnd(20), 'km²:', String(f.properties.area_km2).padStart(8),
    'polys:', f.geometry.coordinates.length);
}
