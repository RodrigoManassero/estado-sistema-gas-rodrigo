#!/usr/bin/env node
/**
 * Build simplified distribuidoras.geojson for the gas DISTRIBUIDORAS of Argentina.
 *
 * Input:  /tmp/polymaps_prov.json  (Polymaps-Argentina provincias, EPSG:4326)
 * Output: public/data/distribuidoras.geojson (EPSG:3857, one feature per distribuidora)
 *
 * Steps:
 *   1. Load provincial polygons.
 *   2. Douglas-Peucker simplify each ring (tol in degrees).
 *   3. Reproject every point to EPSG:3857 Web Mercator.
 *   4. Group provinces into 9 distribuidora MultiPolygons.
 *   5. Split Buenos Aires province for Metrogas/Naturgy BAN using approximate
 *      conurbano bbox and a lat cutoff.
 *   6. Write GeoJSON.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const INPUT = process.env.POLYMAPS_PROV ||
  'C:/Users/mpodeley/AppData/Local/Temp/polymaps_prov.json';
const OUTPUT = path.join(
  'C:/Users/mpodeley/Documents/projects/estado_del_sistema',
  'public/data/distribuidoras.geojson'
);
const TOL_DEG = 0.02; // simplification tolerance in degrees (~2 km)

// Province -> distribuidora slug. Chaco is split: NW to Centro, rest to Gasnea.
// Polymaps dataset has only one Chaco polygon so we assign it entirely to Gasnea
// (its historic area; Centro's Chaco service is a small sliver).
const PROV_TO_DIST = {
  'Jujuy': 'gasnor',
  'Salta': 'gasnor',
  'Tucuman': 'gasnor',
  'Santiago del Estero': 'gasnor',
  'Formosa': 'gasnea',
  'Chaco': 'gasnea',
  'Misiones': 'gasnea',
  'Corrientes': 'gasnea',
  'Catamarca': 'centro',
  'La Rioja': 'centro',
  'Cordoba': 'centro',
  'Santa Fe': 'litoral',
  'Entre Rios': 'litoral',
  'San Juan': 'cuyana',
  'Mendoza': 'cuyana',
  'San Luis': 'cuyana',
  'La Pampa': 'pampeana',
  // Buenos Aires is split below
  'Neuquen': 'sur',
  'Rio Negro': 'sur',
  'Chubut': 'sur',
  'Santa Cruz': 'sur',
  'Tierra del Fuego': 'sur',
  // CABA -> Metrogas
  'Capital Federal': 'metrogas',
};

const DIST_META = {
  metrogas:    { name: 'Metrogas' },
  naturgy_ban: { name: 'Naturgy BAN' },
  pampeana:    { name: 'Camuzzi Gas Pampeana' },
  sur:         { name: 'Camuzzi Gas del Sur' },
  litoral:     { name: 'Litoral Gas' },
  centro:      { name: 'Distribuidora de Gas del Centro (Ecogas)' },
  cuyana:      { name: 'Distribuidora de Gas Cuyana (Ecogas)' },
  gasnor:      { name: 'Gasnor' },
  gasnea:      { name: 'Gasnea' },
};

// Approximate Buenos Aires metro-area box (lon, lat) to split BA province
// into Metrogas-south / Naturgy-north / Pampeana-rest. This is coarse.
// Metrogas covers partidos south of the Riachuelo (roughly lat <= -34.65, west
// to ~-58.6), Naturgy BAN covers the northern/western conurbano.
const CONURBANO = {
  // Everything inside this bbox and inside Buenos Aires province is considered
  // "conurbano" for splitting purposes.
  minLon: -58.85, maxLon: -58.15,
  minLat: -35.00, maxLat: -34.30,
};
const METRO_LAT_CUT = -34.65; // south of this lat within conurbano -> Metrogas

// ---------------------------------------------------------------------------
// Douglas-Peucker (2D, in input coord units -- degrees here)
// ---------------------------------------------------------------------------

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
    if (maxD > tol2) {
      keep[index] = 1;
      stack.push([first, index]);
      stack.push([index, last]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

// Ensure ring remains a closed polygon with at least 4 points
function simplifyRing(ring, tol) {
  let s = simplifyDP(ring, tol);
  if (s.length < 4) return null;
  // ensure closed
  const f = s[0], l = s[s.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) s.push([f[0], f[1]]);
  return s;
}

// ---------------------------------------------------------------------------
// EPSG:4326 -> EPSG:3857
// ---------------------------------------------------------------------------

const R = 6378137.0;
function project([lon, lat]) {
  const x = R * (lon * Math.PI / 180);
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 360)));
  return [Math.round(x), Math.round(y)]; // integer metres is plenty
}

function projectRing(ring) {
  return ring.map(project);
}

// ---------------------------------------------------------------------------
// Polygon filter utilities
// ---------------------------------------------------------------------------

function ringBBox(ring) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

function ringArea(ring) {
  // shoelace (signed), in input units^2
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

// Keep only the N largest rings of a feature to drop tiny islands
function topNRings(rings, n) {
  return rings
    .map(r => ({ r, a: ringArea(r) }))
    .sort((x, y) => y.a - x.a)
    .slice(0, n)
    .map(x => x.r);
}

// ---------------------------------------------------------------------------
// Load input
// ---------------------------------------------------------------------------

const src = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

// Collect per-province rings (outer only -- source has no holes).
// Keep TdF's largest two rings only (main island region) to avoid 21 islets.
const provRings = {}; // provincia name -> array of rings (arrays of [lon,lat])

for (const feat of src.features) {
  const name = feat.properties.provincia;
  const geom = feat.geometry;
  let rings = [];
  if (geom.type === 'Polygon') {
    // Each "polygon" here is just one ring (source has no holes).
    rings = geom.coordinates; // [ring]
  } else if (geom.type === 'MultiPolygon') {
    // Each inner polygon is [[ring], [hole...]]; take outer only.
    for (const poly of geom.coordinates) rings.push(poly[0]);
  }
  if (!provRings[name]) provRings[name] = [];
  provRings[name].push(...rings);
}

// Handle TdF islets: keep only largest 2 rings
if (provRings['Tierra del Fuego']) {
  provRings['Tierra del Fuego'] = topNRings(provRings['Tierra del Fuego'], 2);
}
// Entre Rios has a stray tiny ring (objectid 17, Isla Martín García-ish) -- keep top 1
if (provRings['Entre Rios']) {
  provRings['Entre Rios'] = topNRings(provRings['Entre Rios'], 1);
}

// ---------------------------------------------------------------------------
// Buenos Aires split
// ---------------------------------------------------------------------------

// Approach: take the BA province ring, produce 3 output rings by boolean
// clipping with CONURBANO box + lat cutoff. Real clipping is complex; instead
// we use a simple approach: build 3 separate rough rings:
//   * Metrogas BA = small triangular strip south of CABA inside conurbano
//   * Naturgy BAN = larger strip north/west of CABA inside conurbano
//   * Pampeana    = the full BA province (leaving the two conurbano strips as
//                   visually-overlapping toppings). Because Metrogas/BAN are
//                   drawn on top they hide Pampeana in the conurbano area.
//
// The overlap is visually fine for a dashboard. Keeps geometry correct and
// simple.

// For Metrogas we *append* a small rectangle approximating the southern
// conurbano. CABA polygon already goes to Metrogas.
function bboxRing(minLon, maxLon, minLat, maxLat) {
  return [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
    [minLon, minLat],
  ];
}

// Metrogas conurbano-south ring (roughly Avellaneda, Lanus, Lomas, QuilMes,
// Berazategui up to Florencio Varela)
const metroSouthRing = bboxRing(-58.55, -58.10, -34.95, METRO_LAT_CUT);
// Naturgy BAN conurbano-north ring (Vicente Lopez through Pilar/Escobar area)
const banNorthRing = bboxRing(-59.10, -58.35, METRO_LAT_CUT, -34.30);

// ---------------------------------------------------------------------------
// Simplify + project per-province, then route to distribuidoras
// ---------------------------------------------------------------------------

function processRings(rings) {
  const out = [];
  for (const r of rings) {
    const s = simplifyRing(r, TOL_DEG);
    if (!s) continue;
    out.push(projectRing(s));
  }
  return out;
}

const distRings = {}; // slug -> array of projected rings
for (const slug of Object.keys(DIST_META)) distRings[slug] = [];

for (const [prov, rings] of Object.entries(provRings)) {
  if (prov === 'Buenos Aires') {
    // Full BA province goes to pampeana (stays visually behind metro/ban ovrly)
    distRings.pampeana.push(...processRings(rings));
    continue;
  }
  const slug = PROV_TO_DIST[prov];
  if (!slug) {
    console.warn('No distribuidora mapping for province:', prov);
    continue;
  }
  distRings[slug].push(...processRings(rings));
}

// Metrogas: CABA (already added) + southern conurbano rectangle
distRings.metrogas.push(projectRing(metroSouthRing));
// Naturgy BAN: northern conurbano rectangle
distRings.naturgy_ban.push(projectRing(banNorthRing));

// ---------------------------------------------------------------------------
// Assemble GeoJSON
// ---------------------------------------------------------------------------

const features = [];
for (const slug of Object.keys(DIST_META)) {
  const rings = distRings[slug];
  if (!rings.length) {
    console.warn('Distribuidora has no geometry:', slug);
    continue;
  }
  // Each projected ring becomes its own polygon (no holes).
  const multi = rings.map(r => [r]);
  features.push({
    type: 'Feature',
    properties: {
      id: slug,
      name: DIST_META[slug].name,
    },
    geometry: {
      type: 'MultiPolygon',
      coordinates: multi,
    },
  });
}

const geojson = {
  type: 'FeatureCollection',
  crs: {
    type: 'name',
    properties: { name: 'urn:ogc:def:crs:EPSG::3857' },
  },
  features,
};

// Compact JSON
const text = JSON.stringify(geojson);
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, text);

const sz = fs.statSync(OUTPUT).size;
console.log('Wrote', OUTPUT);
console.log('Size:', sz, 'bytes', (sz / 1024).toFixed(1) + ' KB');
console.log('Features:', features.length);
for (const f of features) {
  const n = f.geometry.coordinates.reduce(
    (s, p) => s + p[0].length, 0);
  console.log('  ', f.properties.id.padEnd(12), 'polys:',
    f.geometry.coordinates.length.toString().padStart(3),
    'pts:', n);
}
