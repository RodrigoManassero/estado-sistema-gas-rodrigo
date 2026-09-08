import { useMemo, useState } from 'react'
import { colors, iconBtn, radius, sectionTitle, space } from '../theme'
import { useMapPanZoom } from '../hooks/useMapPanZoom'
import { HEAT_PALETTE, NO_DATA, quantileBins, densityColor, formatBins } from '../utils/choropleth'
import ProvinciaTrendPanel, { type TrendPoint } from './ProvinciaTrendPanel'
import type {
  GasNetwork,
  GasRoute,
  CountryOutline,
  TramoRow,
  DistribuidorasCollection,
  EnargasMonthly,
  ProvinciasCollection,
  ProvinciaConsumoRow,
} from '../hooks/useData'
import type { EnargasRDSRow } from '../types'

const NEUTRAL = '#64748b'

const utilizationColor = (u: number | null | undefined): string => {
  if (u == null) return NEUTRAL
  if (u >= 1) return '#ff5f87'
  if (u >= 0.8) return '#ff9d4d'
  if (u >= 0.5) return '#ffe06d'
  return '#53e0a1'
}

// Transport operator per gasoducto name. Kept here because the gasoductos
// dataset doesn't carry it (it only has gasoducto name). Names vary in
// encoding; compare with normalized forms.
type Operator = 'TGN' | 'TGS' | 'GPNK' | 'Camuzzi' | 'Export' | 'Otro'

const OPERATOR_COLORS: Record<Operator, string> = {
  TGN: '#60a5fa',
  TGS: '#34d399',
  GPNK: '#fbbf24',
  Camuzzi: '#a78bfa',
  Export: '#f472b6',
  Otro: NEUTRAL,
}

const OPERATOR_BY_GASODUCTO: Record<string, Operator> = {
  'Centro Oeste': 'TGN',
  'Norte': 'TGN',
  'TF TGN': 'TGN',
  'TF TGN - Contraflujo': 'TGN',
  'Neuba I': 'TGS',
  'Neuba II': 'TGS',
  'San Martín': 'TGS',
  'TF TGS': 'TGS',
  'Perito Moreno': 'GPNK',
  'Perito Moreno tie-in': 'GPNK',
  'Cordillerano': 'Camuzzi',
  'Patagónico': 'Camuzzi',
  'Fueguino': 'Camuzzi',
  'Gas Andes': 'Export',
  'Nor Andino': 'Export',
  'Nor Andino Exp': 'Export',
  'Nor Andino Imp': 'Export',
  'Methanex': 'Export',
  'Cruz del Sur': 'Export',
  'Pacífico': 'Export',
  'Juana Azurduy': 'Export',
  'Mercedes-Cardales': 'Otro',
}

function stressForGasoducto(
  gasoducto: string,
  tramos: TramoRow | undefined,
): number | null {
  if (!tramos) return null
  const util = (n: number | null, corte: number | null) => {
    if (n == null || n === 0) return null
    return Math.max(0, (n + (corte ?? 0)) / n)
  }
  if (gasoducto === 'Centro Oeste')
    return util(tramos.cco_capacidad, tramos.cco_corte)
  if (gasoducto === 'Neuba I' || gasoducto === 'Neuba II')
    return util(tramos.tgs_nqn_capacidad, tramos.tgs_nqn_corte)
  if (gasoducto === 'Gas Andes')
    return tramos.gas_andes_autorizacion != null && tramos.gas_andes_autorizacion > 0 ? 0.5 : null
  return null
}

// Curated anchor labels that stay visible to orient the viewer.
const ALWAYS_LABELED = new Set<string>([
  'Loma La Lata',
  'Sierra Barrosa',
  'Cerro Dragón',
  'Magallanes',
  'Campo Durán',
  'Bolivia',
  'GNL Escobar',
  'Bahía Blanca',
  'Mercedes',
])

// Cuencas: approximate centroids (lat, lon) + the field in the ENARGAS
// monthly data that carries its volume.
const CUENCAS: { id: string; label: string; lat: number; lon: number }[] = [
  { id: 'neuquina', label: 'Cuenca Neuquina', lat: -38.6, lon: -69.5 },
  { id: 'noroeste', label: 'Cuenca Noroeste (NOA)', lat: -24.5, lon: -64.5 },
  { id: 'san_jorge', label: 'Cuenca San Jorge', lat: -45.5, lon: -68.5 },
  { id: 'austral', label: 'Cuenca Austral', lat: -52.3, lon: -68.5 },
]

// Project lat/lon -> Web Mercator metres (EPSG:3857).
const R = 6378137
function toMercator(lat: number, lon: number): { x: number; y: number } {
  const rad = Math.PI / 180
  const x = lon * rad * R
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2)) * R
  return { x, y }
}

interface Props {
  network: GasNetwork
  outline: CountryOutline
  tramos?: TramoRow[]
  distribuidoras?: DistribuidorasCollection | null
  monthly?: EnargasMonthly | null
  /** Latest ENARGAS RDS row — feeds the national consumption/supply donuts. */
  rds?: EnargasRDSRow | null
  /** Province polygons (EPSG:3857, with area_km2) for the density heatmap. */
  provincias?: ProvinciasCollection | null
  /** Monthly gas-entregado per province — feeds the heatmap + consumption bubbles. */
  provinciasConsumo?: ProvinciaConsumoRow[] | null
}

type LayerKey = 'heatmap' | 'network' | 'provBubbles' | 'distribuidoras' | 'cuencaBubbles'

const DIST_COLORS: Record<string, string> = {
  metrogas: '#3b82f6',
  naturgy_ban: '#8b5cf6',
  pampeana: '#06b6d4',
  sur: '#0891b2',
  litoral: '#22d3ee',
  centro: '#eab308',
  cuyana: '#f59e0b',
  gasnor: '#ef4444',
  gasnea: '#ec4899',
}

/** Centroid of the largest ring in a GeoJSON MultiPolygon (already projected
 *  to EPSG:3857). Returns (x, y). Used for bubble placement. */
function polyCentroid(multi: number[][][][]): { x: number; y: number } {
  let best: number[][] | null = null
  let bestArea = 0
  for (const poly of multi) {
    const ring = poly[0]
    if (!ring || ring.length < 3) continue
    // Shoelace for absolute area (ignoring hole subtraction).
    let a = 0
    for (let i = 0; i < ring.length - 1; i++) {
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    }
    a = Math.abs(a) / 2
    if (a > bestArea) {
      bestArea = a
      best = ring
    }
  }
  if (!best) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  for (const [x, y] of best) {
    sx += x
    sy += y
  }
  return { x: sx / best.length, y: sy / best.length }
}

/** Filled pie wedge from angle a0 to a1 (radians, 0 = +x, clockwise in SVG's
 *  y-down space). Used for the on-map cuenca TGN/TGS split and the panel donuts. */
function pieWedgePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(a0)
  const y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
}

export default function NetworkMap({ network, outline, tramos = [], distribuidoras, monthly, rds, provincias, provinciasConsumo }: Props) {
  const [hover, setHover] = useState<GasRoute | null>(null)
  const [hoverDist, setHoverDist] = useState<string | null>(null)
  const [hoverCuenca, setHoverCuenca] = useState<string | null>(null)
  const [hoverProv, setHoverProv] = useState<string | null>(null)
  const [selectedProv, setSelectedProv] = useState<string | null>(null)
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    heatmap: true,
    network: true,
    provBubbles: true,
    distribuidoras: true,
    cuencaBubbles: false,
  })
  const toggle = (k: LayerKey) => setLayers((s) => ({ ...s, [k]: !s[k] }))

  const latestTramo = tramos[tramos.length - 1]

  // Render in EPSG:3857 metres ÷ K. Raw metres are ~8e6 with a ~5e6 extent;
  // browsers fail to rasterize large polygon *fills* at that magnitude (lines,
  // strokes and small circles still paint, which is why this only bit the
  // province heatmap). Scaling every coordinate — and the viewBox — by the same
  // factor keeps the geometry identical on screen but small enough to fill.
  const K = 1000
  const sx = (v: number) => v / K
  const sy = (v: number) => -v / K
  const minX = outline.bounds.minX / K
  const maxX = outline.bounds.maxX / K
  const minY = outline.bounds.minY / K
  const maxY = outline.bounds.maxY / K
  const width = maxX - minX
  const height = maxY - minY

  // Base viewBox in screen space (y negated, matching the per-point `-y` flips
  // below). The pan/zoom hook turns this into a live viewBox.
  const baseVB = useMemo(
    () => ({ minX, minY: -maxY, w: width, h: height, cx: minX + width / 2, cy: -maxY + height / 2 }),
    [minX, maxY, width, height],
  )
  const { svgRef, viewBox, scale, isDragging, handlers, zoomIn, zoomOut, reset } = useMapPanZoom(baseVB)

  // Size everything (bubbles, strokes, labels) in *screen pixels* rather than
  // Mercator units, so a max bubble size and min text size are meaningful. The
  // SVG renders at ~DISPLAY_W px wide with a uniform fit, so a screen size of
  // `n` px ≈ `n * width / DISPLAY_W` viewBox units. Dividing by the zoom scale
  // keeps elements a constant size on screen as the user zooms.
  const DISPLAY_W = 560
  const px = (n: number) => (n * width) / (scale * DISPLAY_W)

  // ----- edge width scaling -----
  const maxCaudal = useMemo(() => {
    let m = 0
    for (const r of network.routes) {
      const c = Math.abs(r.latest_caudal ?? 0)
      if (c > m) m = c
    }
    return m || 1
  }, [network])

  // ----- cuenca bubbles (supply, split by transportista where available) -----
  const cuencaData = useMemo(() => {
    const latest = monthly?.gas_recibido?.cuenca?.[monthly.gas_recibido.cuenca.length - 1]
    if (!latest) return []
    // tgn/tgs components per cuenca. Only Neuquina is multi-transportista; the
    // others are single, so they render as a solid circle (not a broken donut).
    const split: Record<string, { tgn: number; tgs: number }> = {
      neuquina: { tgn: latest.tgn_neuquina ?? 0, tgs: latest.tgs_neuquina ?? 0 },
      noroeste: { tgn: latest.tgn_noroeste ?? 0, tgs: 0 },
      san_jorge: { tgn: 0, tgs: latest.tgs_san_jorge ?? 0 },
      austral: { tgn: 0, tgs: latest.tgs_austral ?? 0 },
    }
    const totals = Object.values(split).map((s) => s.tgn + s.tgs)
    const max = Math.max(1, ...totals)
    return CUENCAS.map((c) => {
      const s = split[c.id] ?? { tgn: 0, tgs: 0 }
      const v = s.tgn + s.tgs
      const { x, y } = toMercator(c.lat, c.lon)
      return {
        ...c,
        tgn: s.tgn,
        tgs: s.tgs,
        volDam3Month: v,
        volMMm3Day: v / 1000 / 30,
        tgnMMm3Day: s.tgn / 1000 / 30,
        tgsMMm3Day: s.tgs / 1000 / 30,
        // Radius in screen px (converted to viewBox units at render time).
        // Hard cap so the biggest cuenca never swallows the map.
        radiusPx: Math.min(8 + 14 * Math.sqrt(v / max), 22),
        x,
        y,
      }
    })
  }, [monthly])

  // ----- province consumption (heatmap density + bubbles) -----
  // Latest monthly row of ENARGAS gas-entregado-por-provincia (dam³/mes).
  const provLatest = provinciasConsumo && provinciasConsumo.length > 0
    ? provinciasConsumo[provinciasConsumo.length - 1]
    : null

  // Per-province total + density (dam³/mes·km⁻²) and the quantile bins for the
  // heatmap color scale. Provinces without a network (Misiones/Formosa) → null.
  const provInfo = useMemo(() => {
    const map = new Map<string, { total: number | null; density: number; name: string; area: number }>()
    if (!provincias?.features) return { map, bins: [] as number[] }
    const densities: number[] = []
    for (const f of provincias.features) {
      const slug = f.properties.id
      const raw = provLatest ? provLatest[slug] : null
      const total = typeof raw === 'number' ? raw : null
      const area = f.properties.area_km2 || 0
      const density = total != null && area > 0 ? total / area : 0
      map.set(slug, { total, density, name: f.properties.name, area })
      densities.push(density)
    }
    return { map, bins: quantileBins(densities) }
  }, [provincias, provLatest])

  // Consumption bubbles sized by absolute volume (complementary to the density
  // heatmap). Placed at each province's largest-ring centroid.
  const provBubbles = useMemo(() => {
    if (!provincias?.features) return []
    let max = 1
    for (const info of provInfo.map.values()) if (info.total && info.total > max) max = info.total
    return provincias.features
      .map((f) => {
        const info = provInfo.map.get(f.properties.id)
        const v = info?.total ?? 0
        const { x, y } = polyCentroid(f.geometry.coordinates)
        return {
          slug: f.properties.id,
          name: f.properties.name,
          x,
          y,
          total: v,
          mmm3Month: v / 1000,
          radiusPx: v > 0 ? Math.min(6 + 12 * Math.sqrt(v / max), 18) : 0,
        }
      })
      .filter((b) => b.total > 0)
  }, [provincias, provInfo])

  // Monthly trend (MMm³) for the selected province.
  const selectedSeries = useMemo<TrendPoint[]>(() => {
    if (!selectedProv || !provinciasConsumo) return []
    return provinciasConsumo
      .map((r) => {
        const v = r[selectedProv]
        return { fecha: (r.fecha as string).slice(0, 7), mmm3: typeof v === 'number' ? v / 1000 : null }
      })
      .filter((d) => d.mmm3 != null)
  }, [provinciasConsumo, selectedProv])
  const selectedName = selectedProv ? provInfo.map.get(selectedProv)?.name ?? selectedProv : ''
  const hasProv = !!provincias?.features?.length && !!provLatest

  const nodesById = useMemo(
    () => Object.fromEntries(network.nodes.map((n) => [n.nodeId, n])),
    [network],
  )

  return (
    <div>
      <h3 style={sectionTitle}>
        Mapa del sistema — red, distribuidoras y consumo por provincia
        <span style={{ float: 'right', fontSize: 11, color: colors.textDim, textTransform: 'none', fontWeight: 400 }}>
          Topología via{' '}
          <a href="https://github.com/mpodeley/gasoductos" target="_blank" rel="noopener" style={{ color: colors.accent.blue }}>
            mpodeley/gasoductos
          </a>
        </span>
      </h3>

      {/* Layer toggles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: space.sm }}>
        {([
          ['heatmap', 'Densidad provincial', hasProv],
          ['provBubbles', 'Consumo (burbujas)', hasProv],
          ['network', 'Red de gasoductos', true],
          ['distribuidoras', 'Distribuidoras', !!distribuidoras?.features?.length],
          ['cuencaBubbles', 'Oferta por cuenca', cuencaData.length > 0],
        ] as [LayerKey, string, boolean][])
          .filter(([, , avail]) => avail)
          .map(([key, label]) => (
            <button key={key} onClick={() => toggle(key)} style={layerBtn(layers[key])}>
              {label}
            </button>
          ))}
      </div>

      <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto' }}>
        <svg
          ref={svgRef}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          {...handlers}
          style={{
            width: '100%',
            height: 'auto',
            background: '#0b1220',
            borderRadius: 8,
            display: 'block',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          {/* Argentina outline */}
          {outline.polygons.map((poly, i) => (
            <polygon
              key={i}
              points={poly.map((v) => `${sx(v.x)},${sy(v.y)}`).join(' ')}
              fill="#1e293b"
              stroke="#334155"
              strokeWidth={px(0.7)}
            />
          ))}

          {/* Province consumption heatmap (density gas/km²). Bottom interactive
              layer: hover → tooltip, click → trend. */}
          {layers.heatmap && provincias?.features.map((f) => {
            const slug = f.properties.id
            const info = provInfo.map.get(slug)
            const hasData = !!info && info.total != null
            const fill = hasData ? densityColor(info!.density, provInfo.bins) : NO_DATA
            const isHover = hoverProv === slug
            const isSel = selectedProv === slug
            return (
              <g
                key={`heat-${slug}`}
                onMouseEnter={() => !isDragging && setHoverProv(slug)}
                onMouseLeave={() => setHoverProv(null)}
                onClick={() => !isDragging && setSelectedProv(isSel ? null : slug)}
                style={{ pointerEvents: isDragging ? 'none' : 'auto', cursor: 'pointer' }}
              >
                {f.geometry.coordinates.map((polygon, pi) => (
                  <polygon
                    key={pi}
                    points={(polygon[0] ?? []).map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')}
                    fill={fill}
                    fillOpacity={hasData ? 1 : 0.5}
                    stroke={isSel ? '#f1f5f9' : '#0b1220'}
                    strokeWidth={px(isSel ? 1.2 : 0.5)}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )
          })}

          {/* Distribuidora regions: outline-only when the heatmap is on (lets the
              density show through and province clicks pass to the layer below);
              colored fill + hover when the heatmap is off (legacy look). */}
          {layers.distribuidoras && distribuidoras?.features.map((f) => {
            const id = f.properties.id
            const color = DIST_COLORS[id] ?? '#475569'
            const isHover = hoverDist === id
            const outlineOnly = layers.heatmap
            return (
              <g
                key={id}
                onMouseEnter={() => !outlineOnly && !isDragging && setHoverDist(id)}
                onMouseLeave={() => setHoverDist(null)}
                style={{ pointerEvents: outlineOnly || isDragging ? 'none' : 'auto' }}
              >
                {f.geometry.coordinates.map((polygon, pi) => (
                  <polygon
                    key={pi}
                    points={(polygon[0] ?? []).map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')}
                    fill={outlineOnly ? 'none' : color}
                    fillOpacity={outlineOnly ? 0 : isHover ? 0.35 : 0.15}
                    stroke={outlineOnly ? '#e2e8f0' : color}
                    strokeOpacity={outlineOnly ? 0.22 : isHover ? 0.8 : 0.35}
                    strokeWidth={px(outlineOnly ? 0.5 : isHover ? 0.8 : 0.4)}
                  />
                ))}
              </g>
            )
          })}

          {/* Pipelines: operator color by default, stress color overrides for
              the 3 tramos we track (CCO, Neuba I/II, Gas Andes). */}
          {layers.network && network.routes.map((e) => {
            const util = stressForGasoducto(e.gasoducto, latestTramo)
            const hasStress = util != null
            const operator: Operator = OPERATOR_BY_GASODUCTO[e.gasoducto] ?? 'Otro'
            const color = hasStress ? utilizationColor(util) : OPERATOR_COLORS[operator]
            const caudal = Math.abs(e.latest_caudal ?? 0)
            const w = px(1.3 + 5.0 * (caudal / maxCaudal))
            const isHover = hover?.edgeId === e.edgeId
            const isDim = hover && !isHover
            return (
              <g
                key={e.edgeId}
                onMouseEnter={() => !isDragging && setHover(e)}
                onMouseLeave={() => setHover(null)}
                style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
              >
                <line
                  x1={sx(e.xOrigen)}
                  y1={sy(e.yOrigen)}
                  x2={sx(e.xDestino)}
                  y2={sy(e.yDestino)}
                  stroke={color}
                  strokeWidth={isHover ? w * 1.7 : w}
                  strokeOpacity={isDim ? 0.2 : 0.9}
                />
                <line
                  x1={sx(e.xOrigen)}
                  y1={sy(e.yOrigen)}
                  x2={sx(e.xDestino)}
                  y2={sy(e.yDestino)}
                  stroke="transparent"
                  strokeWidth={Math.max(w * 3, px(8))}
                />
              </g>
            )
          })}

          {/* Network nodes — bigger dots and readable labels */}
          {layers.network && network.nodes.map((n) => {
            const role = n.roleProxy
            const fill = role === 'source_proxy' ? '#34d399'
              : role === 'sink_proxy' ? '#60a5fa'
              : role === 'inactive' ? '#475569'
              : '#94a3b8'
            const r = px(role === 'source_proxy' ? 3 : role === 'sink_proxy' ? 2.4 : 1.6)
            const labeled = ALWAYS_LABELED.has(n.nombre)
            return (
              <g key={n.nodeId}>
                <circle cx={sx(n.x)} cy={sy(n.y)} r={r} fill={fill} fillOpacity={0.9} stroke="#0b1220" strokeWidth={px(0.5)} />
                {labeled && (
                  <text
                    x={sx(n.x) + px(4)}
                    y={sy(n.y) + px(3.5)}
                    fontSize={px(11)}
                    fill={colors.textSecondary}
                    stroke="#0b1220"
                    strokeWidth={px(1.4)}
                    paintOrder="stroke"
                    fontWeight={500}
                  >
                    {n.nombre}
                  </text>
                )}
              </g>
            )
          })}

          {/* Cuenca bubbles (supply). Neuquina splits TGN/TGS as a pie; the
              single-transportista cuencas render as a solid circle. Name is
              always shown to orient; volume + split only on hover. */}
          {layers.cuencaBubbles && cuencaData.map((c) => {
            const isHover = hoverCuenca === c.id
            const rr = px(c.radiusPx)
            const cx = sx(c.x)
            const cy = sy(c.y)
            const op = isHover ? 0.6 : 0.32
            const isSplit = c.tgn > 0 && c.tgs > 0
            const total = c.tgn + c.tgs || 1
            const tgsEnd = -Math.PI / 2 + 2 * Math.PI * (c.tgs / total)
            return (
              <g
                key={c.id}
                onMouseEnter={() => !isDragging && setHoverCuenca(c.id)}
                onMouseLeave={() => setHoverCuenca(null)}
                style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
              >
                {isSplit ? (
                  <>
                    <path
                      d={pieWedgePath(cx, cy, rr, -Math.PI / 2, tgsEnd)}
                      fill={OPERATOR_COLORS.TGS}
                      fillOpacity={op}
                      stroke="#0b1220"
                      strokeWidth={px(0.6)}
                    />
                    <path
                      d={pieWedgePath(cx, cy, rr, tgsEnd, -Math.PI / 2 + 2 * Math.PI)}
                      fill={OPERATOR_COLORS.TGN}
                      fillOpacity={op}
                      stroke="#0b1220"
                      strokeWidth={px(0.6)}
                    />
                  </>
                ) : (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={rr}
                    fill={c.tgs > 0 ? OPERATOR_COLORS.TGS : OPERATOR_COLORS.TGN}
                    fillOpacity={op}
                    stroke="#0b1220"
                    strokeWidth={px(0.6)}
                  />
                )}
                <text
                  x={cx}
                  y={cy - rr - px(4)}
                  fontSize={px(13)}
                  fill={colors.textPrimary}
                  textAnchor="middle"
                  stroke="#0b1220"
                  strokeWidth={px(1.6)}
                  paintOrder="stroke"
                  fontWeight={700}
                >
                  {c.label.replace('Cuenca ', '')}
                </text>
                {isHover && (
                  <>
                    <text
                      x={cx}
                      y={cy + rr + px(11)}
                      fontSize={px(12)}
                      fill={colors.textPrimary}
                      textAnchor="middle"
                      stroke="#0b1220"
                      strokeWidth={px(1.5)}
                      paintOrder="stroke"
                      fontWeight={700}
                    >
                      {c.volMMm3Day.toFixed(0)} MMm³/d
                    </text>
                    {isSplit && (
                      <text
                        x={cx}
                        y={cy + rr + px(22)}
                        fontSize={px(10)}
                        fill={colors.textSecondary}
                        textAnchor="middle"
                        stroke="#0b1220"
                        strokeWidth={px(1.2)}
                        paintOrder="stroke"
                        fontWeight={600}
                      >
                        TGN {c.tgnMMm3Day.toFixed(0)} · TGS {c.tgsMMm3Day.toFixed(0)}
                      </text>
                    )}
                  </>
                )}
              </g>
            )
          })}

          {/* Province consumption bubbles (demand). Sized by absolute volume so
              they complement the density heatmap (which encodes intensity). */}
          {layers.provBubbles && provBubbles.map((b) => {
            const isHover = hoverProv === b.slug
            const isSel = selectedProv === b.slug
            const rr = px(b.radiusPx)
            return (
              <g
                key={`bub-${b.slug}`}
                onMouseEnter={() => !isDragging && setHoverProv(b.slug)}
                onMouseLeave={() => setHoverProv(null)}
                onClick={() => !isDragging && setSelectedProv(isSel ? null : b.slug)}
                style={{ pointerEvents: isDragging ? 'none' : 'auto', cursor: 'pointer' }}
              >
                <circle
                  cx={sx(b.x)}
                  cy={sy(b.y)}
                  r={rr}
                  fill={colors.accent.orange}
                  fillOpacity={isHover || isSel ? 0.85 : 0.55}
                  stroke={isSel ? '#f1f5f9' : '#0b1220'}
                  strokeWidth={px(isSel ? 1 : 0.6)}
                />
                {(isHover || isSel) && (
                  <>
                    <text
                      x={sx(b.x)}
                      y={sy(b.y) - rr - px(3)}
                      fontSize={px(11)}
                      fill={colors.textPrimary}
                      textAnchor="middle"
                      stroke="#0b1220"
                      strokeWidth={px(1.4)}
                      paintOrder="stroke"
                      fontWeight={700}
                    >
                      {b.name}
                    </text>
                    <text
                      x={sx(b.x)}
                      y={sy(b.y) + rr + px(10)}
                      fontSize={px(9.5)}
                      fill={colors.textSecondary}
                      textAnchor="middle"
                      stroke="#0b1220"
                      strokeWidth={px(1.2)}
                      paintOrder="stroke"
                      fontWeight={600}
                    >
                      {b.mmm3Month.toFixed(0)} MMm³/mes
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </svg>

        {/* Zoom controls overlay */}
        <div
          style={{
            position: 'absolute',
            top: space.sm,
            left: space.sm,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <button onClick={zoomIn} style={iconBtn} title="Acercar">＋</button>
          <button onClick={zoomOut} style={iconBtn} title="Alejar">－</button>
          <button onClick={reset} style={iconBtn} title="Reset">⟲</button>
        </div>

        {/* Hover panel */}
        {hover && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'rgba(15,23,42,0.95)',
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: `${space.sm}px ${space.md}px`,
              minWidth: 220,
              fontSize: 12,
              color: colors.textSecondary,
              pointerEvents: 'none',
            }}
          >
            <div style={{ color: colors.textPrimary, fontWeight: 700, marginBottom: 2 }}>
              {hover.gasoducto}
            </div>
            <div style={{ color: colors.textDim, fontSize: 11, marginBottom: 4 }}>
              {OPERATOR_BY_GASODUCTO[hover.gasoducto] ?? 'Otro'} ·{' '}
              {nodesById[hover.sourceNodeId]?.nombre ?? hover.origen} → {nodesById[hover.targetNodeId]?.nombre ?? hover.destino}
            </div>
            {hover.latest_caudal != null && (
              <Kv label="Caudal" value={`${hover.latest_caudal.toFixed(2)} MMm³/d`} />
            )}
            {hover.effectiveCapacity != null && hover.effectiveCapacity > 0 && (
              <Kv label="Capacidad" value={`${hover.effectiveCapacity.toFixed(1)} MMm³/d`} />
            )}
            {stressForGasoducto(hover.gasoducto, latestTramo) != null && (
              <Kv
                label="Stress actual"
                value={`${(stressForGasoducto(hover.gasoducto, latestTramo)! * 100).toFixed(0)}%`}
              />
            )}
            {hover.latest_utilization != null && stressForGasoducto(hover.gasoducto, latestTramo) == null && (
              <Kv
                label="Util. (GCIE 2025-09)"
                value={`${(hover.latest_utilization * 100).toFixed(0)}%`}
              />
            )}
          </div>
        )}

        {/* Province hover tooltip */}
        {hoverProv && (() => {
          const info = provInfo.map.get(hoverProv)
          if (!info) return null
          return (
            <div
              style={{
                position: 'absolute', bottom: space.sm, left: space.sm,
                background: 'rgba(15,23,42,0.95)', border: `1px solid ${colors.border}`,
                borderRadius: 8, padding: `${space.sm}px ${space.md}px`, fontSize: 12,
                color: colors.textSecondary, pointerEvents: 'none', maxWidth: 240,
              }}
            >
              <div style={{ color: colors.textPrimary, fontWeight: 700 }}>{info.name}</div>
              {info.total != null ? (
                <div style={{ marginTop: 4, lineHeight: 1.6 }}>
                  <div>Consumo: <strong>{(info.total / 1000).toFixed(1)}</strong> MMm³/mes</div>
                  <div>Densidad: <strong>{info.density.toFixed(2)}</strong> mil m³/mes·km⁻²</div>
                  <div style={{ color: colors.textDim, fontSize: 11 }}>click para ver evolución</div>
                </div>
              ) : (
                <div style={{ marginTop: 4, color: colors.textDim }}>Sin red de distribución.</div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Per-province monthly trend (opens on click) */}
      {selectedProv && (
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <ProvinciaTrendPanel provinciaName={selectedName} series={selectedSeries} onClose={() => setSelectedProv(null)} />
        </div>
      )}

      {/* National mix donuts — the only level at which the segment / supply
          split exists. Helps read the system composition at a glance. */}
      <NationalMixPanel rds={rds} />

      {/* Legends */}
      <div style={{ marginTop: space.sm, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: space.md, fontSize: 11, color: colors.textDim }}>
        {layers.heatmap && provInfo.bins.length > 0 && (
          <div>
            <div style={{ color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Densidad consumo (mil m³/mes·km⁻²)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {HEAT_PALETTE.map((c, i) => (
                <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 12, height: 10, background: c, borderRadius: 2 }} />
                  {formatBins(provInfo.bins)[i]}
                </span>
              ))}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 10, background: NO_DATA, borderRadius: 2 }} />
                sin red
              </span>
            </div>
          </div>
        )}
        <div>
          <div style={{ color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Operador (línea)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
            {(Object.keys(OPERATOR_COLORS) as Operator[]).map((op) => (
              <Pill key={op} color={OPERATOR_COLORS[op]} label={op} />
            ))}
          </div>
        </div>
        {latestTramo && (
          <div>
            <div style={{ color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Stress (tramos)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
              <Pill color="#53e0a1" label="< 50%" />
              <Pill color="#ffe06d" label="50–80%" />
              <Pill color="#ff9d4d" label="80–100%" />
              <Pill color="#ff5f87" label="saturado" />
            </div>
          </div>
        )}
      </div>
      <p style={{ color: colors.textDim, fontSize: 11, marginTop: space.sm }}>
        Usá los toggles para prender/apagar capas. <strong>Fondo</strong> = densidad de gas entregado
        por la red de distribución sobre la superficie provincial (ENARGAS, último mes); las burbujas
        naranjas miden el <strong>volumen absoluto</strong> por provincia. No incluye usinas ni grandes
        usuarios que compran gas directo al productor. Pasá el cursor sobre una provincia y hacé click
        para ver su evolución mensual. <strong>Líneas</strong> = gasoductos coloreados por operador;
        el grosor refleja el caudal relativo (snapshot GCIE). Las burbujas de oferta por cuenca
        ({formatVolDate(monthly)}, partido TGN/TGS en Neuquina) son una capa opcional. Rueda para zoom,
        arrastrar para mover, ⟲ para resetear.
      </p>
    </div>
  )
}

function formatVolDate(monthly: EnargasMonthly | null | undefined): string {
  const s = monthly?.gas_recibido?.cuenca?.[(monthly.gas_recibido.cuenca.length ?? 0) - 1]?.fecha
  return s ? s.slice(0, 7) : 'último mes'
}

const layerBtn = (active: boolean): React.CSSProperties => ({
  background: active ? colors.accent.blue + '33' : 'transparent',
  color: active ? colors.textPrimary : colors.textDim,
  border: `1px solid ${active ? colors.accent.blue : colors.border}`,
  borderRadius: radius.pill,
  padding: '3px 12px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
})

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '2px 0' }}>
      <span style={{ color: colors.textDim }}>{label}</span>
      <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 14, height: 3, background: color, borderRadius: 2 }} />
      {label}
    </span>
  )
}

interface DonutSeg { label: string; value: number; color: string }

/** Compact hand-rolled donut + legend. National-level only — the segment /
 *  supply split doesn't exist per zone in the data. */
function Donut({ title, unit, segments }: { title: string; unit: string; segments: DonutSeg[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  if (total <= 0) return null
  const R = 38
  const rInner = 23
  const cx = 44
  const cy = 44
  let a = -Math.PI / 2
  const wedges = segments.map((s) => {
    const a0 = a
    a += (s.value / total) * 2 * Math.PI
    return { ...s, a0, a1: a }
  })
  const single = segments.length === 1
  return (
    <div>
      <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ display: 'flex', gap: space.md, alignItems: 'center' }}>
        <svg width={88} height={88} viewBox="0 0 88 88" style={{ flexShrink: 0 }}>
          {single ? (
            <circle cx={cx} cy={cy} r={R} fill={segments[0].color} fillOpacity={0.85} />
          ) : (
            wedges.map((w) => (
              <path
                key={w.label}
                d={pieWedgePath(cx, cy, R, w.a0, w.a1)}
                fill={w.color}
                fillOpacity={0.85}
                stroke={colors.surfaceAlt}
                strokeWidth={1}
              />
            ))
          )}
          <circle cx={cx} cy={cy} r={rInner} fill={colors.surfaceAlt} />
          <text x={cx} y={cy - 1} textAnchor="middle" fontSize={15} fontWeight={700} fill={colors.textPrimary}>
            {total.toFixed(0)}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize={8} fill={colors.textDim}>
            {unit}
          </text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {segments.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.textSecondary }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span style={{ minWidth: 108 }}>{s.label}</span>
              <span style={{ color: colors.textPrimary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {s.value.toFixed(1)}
              </span>
              <span style={{ color: colors.textDim }}>({((s.value / total) * 100).toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function NationalMixPanel({ rds }: { rds?: EnargasRDSRow | null }) {
  if (!rds || !rds.fecha) return null

  const cons = rds.consumos ?? {}
  const consumoSegs: DonutSeg[] = [
    { label: 'Prioritaria', value: cons.prioritaria?.programa ?? 0, color: colors.accent.blue },
    { label: 'Usinas (CAMMESA)', value: cons.cammesa?.programa ?? 0, color: colors.accent.orange },
    { label: 'Industria', value: cons.industria?.programa ?? 0, color: colors.accent.green },
    { label: 'GNC', value: cons.gnc?.programa ?? 0, color: colors.accent.purple },
    { label: 'Combustible', value: cons.combustible?.programa ?? 0, color: colors.accent.gray },
  ].filter((s) => s.value > 0)

  // Supply origin, derived exactly like SystemFlowPanel: local production is the
  // residue of the flow identity (demand + Δlinepack − imports).
  const imps = rds.importaciones ?? {}
  const bolivia = imps.bolivia?.programa ?? 0
  const chile = imps.chile?.programa ?? 0
  const escobar = imps.escobar?.programa ?? 0
  const bahia = imps.bahia_blanca?.programa ?? 0
  const importsTotal = bolivia + chile + escobar + bahia
  const exps = rds.exportaciones ?? {}
  const exportsTotal = (exps.tgn?.vol_exportar ?? 0) + (exps.tgs?.vol_exportar ?? 0)
  const consSum =
    (cons.prioritaria?.programa ?? 0) +
    (cons.cammesa?.programa ?? 0) +
    (cons.industria?.programa ?? 0) +
    (cons.gnc?.programa ?? 0) +
    (cons.combustible?.programa ?? 0)
  const demandTotal = (rds.consumo_total_estimado ?? consSum) + exportsTotal
  const deltaLP = rds.linepack_delta ?? 0
  const local = Math.max(0, demandTotal + deltaLP - importsTotal)
  const supplySegs: DonutSeg[] = [
    { label: 'Producción local', value: local, color: colors.accent.green },
    { label: 'Bolivia', value: bolivia, color: colors.accent.red },
    { label: 'GNL Escobar', value: escobar, color: colors.accent.purple },
    { label: 'GNL Bahía Blanca', value: bahia, color: '#06b6d4' },
    { label: 'Chile (interc.)', value: chile, color: colors.accent.orange },
  ].filter((s) => s.value > 0)

  if (consumoSegs.length === 0 && supplySegs.length === 0) return null

  return (
    <div
      style={{
        marginTop: space.md,
        display: 'flex',
        flexWrap: 'wrap',
        gap: space.xl,
        alignItems: 'flex-start',
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: space.md,
      }}
    >
      <Donut title="Inyección por origen" unit="MMm³/d" segments={supplySegs} />
      <Donut title="Consumo por segmento" unit="MMm³/d" segments={consumoSegs} />
      <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', color: colors.textDim, fontSize: 10 }}>
        ENARGAS RDS · {rds.fecha} · nacional
      </div>
    </div>
  )
}
