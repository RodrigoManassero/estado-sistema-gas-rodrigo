import { useMemo, useState } from 'react'
import { colors, iconBtn, radius, space } from '../theme'
import { useMapPanZoom } from '../hooks/useMapPanZoom'
import type {
  ConcesionesCollection,
  ConcesionFeature,
  ProduccionMes,
  ProduccionHistoricoRow,
  PozoTerminadoMes,
} from '../hooks/useData'

// Cuenca Neuquina viewport (lon/lat). Tight crop around the productive area —
// includes the dry margin to the west so the visible polygon shapes have
// breathing room. Matches the bbox used by fetch_concesiones_geojson.py.
const VIEW = {
  lonMin: -71.0,
  lonMax: -67.2,
  latMin: -40.5,
  latMax: -34.0,
}

// EPSG:3857 Mercator. Same math as NetworkMap.tsx — kept local so this
// component doesn't reach into NetworkMap's internals.
const R = 6378137
function toMercator(lat: number, lon: number): { x: number; y: number } {
  const rad = Math.PI / 180
  return {
    x: lon * rad * R,
    y: Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2)) * R,
  }
}

// Operator colors. Pluspetrol intentionally accent-green so it pops; majors
// get a stable hue each.
const OPERATOR_COLORS: Record<string, string> = {
  'YPF S.A.': '#3b82f6',
  'TECPETROL S.A.': '#f59e0b',
  'TOTAL AUSTRAL S.A.': '#8b5cf6',
  'PAN AMERICAN ENERGY SL': '#ef4444',
  'PLUSPETROL S.A.': '#10b981',
  'PLUSPETROL CUENCA NEUQUINA S.R.L.': '#34d399',
  'PAMPA ENERGIA S.A.': '#ec4899',
  'VISTA ENERGY ARGENTINA SAU': '#06b6d4',
  'CHEVRON ARGENTINA S.R.L.': '#f97316',
  'SHELL ARGENTINA S.A.': '#fbbf24',
  'OILSTONE ENERGIA S.A.': '#a78bfa',
  'PETROQUIMICA COMODORO RIVADAVIA S.A.': '#22d3ee',
  'PETROLEOS SUDAMERICANOS S.A.': '#fb7185',
  'Petrolera Aconcagua Energia S.A.': '#84cc16',
  'BENTIA ENERGY S.A.': '#e879f9',
}
const FALLBACK = '#64748b'
function operatorColor(op: string): string {
  return OPERATOR_COLORS[op] ?? FALLBACK
}

// 7-step monochromatic heatmap (single warm hue: dark brown → amber). Reads
// well on the dark dashboard background and avoids the "rainbow" confusion
// the multi-hue palette was causing.
const HEAT_PALETTE = ['#451a03', '#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#f97316', '#fbbf24']
const NO_DATA = '#334155'

function shortOperator(name: string): string {
  return name
    .replace(/\b(S\.?A\.?R?\.?L?\.?|SAU)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function shortBlock(name: string): string {
  return name
    .toLowerCase()
    .split(/[\s\-]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ')
}

// Polygon area in km² using a local equirectangular projection centred on the
// polygon's mean latitude. Accurate to within ~0.5 % for a single concession;
// good enough for ranking and a heatmap legend.
function polygonAreaKm2(coords: number[][][][]): number {
  const earthR = 6378.137 // km
  let total = 0
  for (const poly of coords) {
    const ring = poly[0] ?? []
    if (ring.length < 3) continue
    const meanLat = ring.reduce((s, p) => s + p[1], 0) / ring.length
    const cosLat = Math.cos((meanLat * Math.PI) / 180)
    const pts = ring.map(([lon, lat]) => ({
      x: ((lon * Math.PI) / 180) * earthR * cosLat,
      y: ((lat * Math.PI) / 180) * earthR,
    }))
    let a = 0
    for (let i = 0; i < pts.length - 1; i++) {
      a += pts[i].x * pts[i + 1].y - pts[i + 1].x * pts[i].y
    }
    total += Math.abs(a) / 2
  }
  return total
}

type Mode = 'operador' | 'gas_prod' | 'pet_prod' | 'gas_acum' | 'pet_acum' | 'pozos_act' | 'pozos_perf'

const M3_PER_BBL = 6.2898   // industry conversion: 1 m³ ≈ 6.2898 bbl

// Trailing window (in months) over which "pozos perforados / km²" sums completed
// wells. 12 months smooths the month-to-month noise (single months swing 18→49
// wells across the whole basin) while still reflecting recent drilling intensity.
const PERF_WINDOW_MONTHS = 12

interface Props {
  concesiones: ConcesionesCollection
  produccion: ProduccionMes[]
  /** Optional lifetime cumulative per (area, empresa). When provided, the
   *  "Acumulado" mode uses this — covers Cap IV history since 2006. When
   *  absent, the mode falls back to summing the months present in
   *  `produccion` (typically just the last 2 years). */
  historico?: ProduccionHistoricoRow[] | null
  /** Optional "pozos terminados" per (mes, area). When provided, enables the
   *  "Pozos perforados / km²" heatmap mode (trailing PERF_WINDOW_MONTHS sum). */
  perforaciones?: PozoTerminadoMes[] | null
  latestMes: string | null
}

interface ProjectedFeature {
  feature: ConcesionFeature
  ringStrings: string[]
  areaKm2: number
  // Densities computed once per render in the units shown in the UI:
  //   gasDailyDensity → mil m³/d · km⁻²   (= dam³/d/km²)
  //   petDailyDensity → bbl/d · km⁻²
  //   gasTotalDensity → MMm³ · km⁻²        (lifetime, when historico available)
  //   petTotalDensity → MMbbl · km⁻²       (lifetime, when historico available)
  gasDailyDensity: number
  petDailyDensity: number
  gasTotalDensity: number
  petTotalDensity: number
  //   pozosActDensity  → pozos activos · km⁻²  (latest month)
  //   pozosPerfDensity → pozos terminados · km⁻²  (trailing PERF_WINDOW_MONTHS)
  pozosActDensity: number
  pozosPerfDensity: number
}

export default function CuencaMap({ concesiones, produccion, historico, perforaciones, latestMes }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('operador')

  // Base viewBox derived from the lat/lon window — never changes. Screen-space
  // (y already negated) so it matches the per-point `-y` flips below.
  const baseVB = useMemo(() => {
    const tl = toMercator(VIEW.latMax, VIEW.lonMin)
    const br = toMercator(VIEW.latMin, VIEW.lonMax)
    const minX = tl.x
    const maxX = br.x
    const minY = -tl.y
    const maxY = -br.y
    const w = maxX - minX
    const h = maxY - minY
    return { minX, minY, w, h, cx: minX + w / 2, cy: minY + h / 2 }
  }, [])

  const { svgRef, viewBox, isDragging, handlers, zoomIn, zoomOut, reset } = useMapPanZoom(baseVB)

  // Project polygon rings + precompute area & densities once per dataset load.
  // Latest-month density is recomputed when latestMes changes, but is cheap.
  const prodByArea = useMemo(() => {
    const m = new Map<string, { latestGas: number; latestPet: number; totalGas: number; pozos: number; empresas: string[] }>()
    for (const r of produccion) {
      const key = (r.area || '').trim().toUpperCase()
      const slot = m.get(key) ?? {
        latestGas: 0,
        latestPet: 0,
        totalGas: 0,
        pozos: 0,
        empresas: [] as string[],
      }
      slot.totalGas += r.prod_gas_mm3
      if (r.mes === latestMes) {
        slot.latestGas += r.prod_gas_mm3
        slot.latestPet += r.prod_pet_m3
        slot.pozos += r.pozos_activos
        if (!slot.empresas.includes(r.empresa)) slot.empresas.push(r.empresa)
      }
      m.set(key, slot)
    }
    return m
  }, [produccion, latestMes])

  const daysInLatest = latestMes ? daysInMonth(latestMes) : 30
  const monthsCoveredRecent = useMemo(() => new Set(produccion.map((r) => r.mes)).size, [produccion])

  // Lifetime cumulative gas+oil per block (preferring historico file when present).
  const totalByArea = useMemo(() => {
    const m = new Map<string, { gas: number; pet: number; primer: string | null; ultimo: string | null; meses: number }>()
    if (historico && historico.length > 0) {
      for (const r of historico) {
        const key = (r.area || '').trim().toUpperCase()
        const slot = m.get(key) ?? { gas: 0, pet: 0, primer: null, ultimo: null, meses: 0 }
        slot.gas += r.gas_acumulado_mm3
        slot.pet += r.pet_acumulado_m3
        slot.meses = Math.max(slot.meses, r.meses_activos)
        if (!slot.primer || (r.primer_mes && r.primer_mes < slot.primer)) slot.primer = r.primer_mes
        if (!slot.ultimo || (r.ultimo_mes && r.ultimo_mes > slot.ultimo)) slot.ultimo = r.ultimo_mes
        m.set(key, slot)
      }
    } else {
      for (const r of produccion) {
        const key = (r.area || '').trim().toUpperCase()
        const slot = m.get(key) ?? { gas: 0, pet: 0, primer: null, ultimo: null, meses: 0 }
        slot.gas += r.prod_gas_mm3
        slot.pet += r.prod_pet_m3
        if (!slot.primer || r.mes < slot.primer) slot.primer = r.mes
        if (!slot.ultimo || r.mes > slot.ultimo) slot.ultimo = r.mes
        slot.meses += 1
        m.set(key, slot)
      }
    }
    return m
  }, [historico, produccion])

  const historicoRango = useMemo(() => {
    if (!historico || historico.length === 0) return null
    let primer: string | null = null
    let ultimo: string | null = null
    for (const r of historico) {
      if (r.primer_mes && (!primer || r.primer_mes < primer)) primer = r.primer_mes
      if (r.ultimo_mes && (!ultimo || r.ultimo_mes > ultimo)) ultimo = r.ultimo_mes
    }
    return primer && ultimo ? { primer, ultimo } : null
  }, [historico])

  // Trailing-window completed wells per block. Uses the most recent
  // PERF_WINDOW_MONTHS distinct months present in `perforaciones`.
  const perf = useMemo(() => {
    if (!perforaciones || perforaciones.length === 0) {
      return { byArea: new Map<string, { pozos: number; pet: number; gas: number; serv: number; otros: number }>(), primer: null as string | null, ultimo: null as string | null }
    }
    const months = [...new Set(perforaciones.map((r) => r.mes))].sort()
    const window = new Set(months.slice(-PERF_WINDOW_MONTHS))
    const byArea = new Map<string, { pozos: number; pet: number; gas: number; serv: number; otros: number }>()
    for (const r of perforaciones) {
      if (!window.has(r.mes)) continue
      const key = (r.area || '').trim().toUpperCase()
      const slot = byArea.get(key) ?? { pozos: 0, pet: 0, gas: 0, serv: 0, otros: 0 }
      slot.pozos += r.pozos
      slot.pet += r.pozos_pet
      slot.gas += r.pozos_gas
      slot.serv += r.pozos_serv
      slot.otros += r.pozos_otros
      byArea.set(key, slot)
    }
    const wm = [...window].sort()
    return { byArea, primer: wm[0] ?? null, ultimo: wm[wm.length - 1] ?? null }
  }, [perforaciones])

  const projected = useMemo<ProjectedFeature[]>(() => {
    return concesiones.features.map((f) => {
      const ringStrings: string[] = []
      for (const polygon of f.geometry.coordinates) {
        const ring = polygon[0] ?? []
        if (ring.length < 3) continue
        const pts = ring
          .map(([lon, lat]) => {
            const m = toMercator(lat, lon)
            return `${m.x.toFixed(0)},${(-m.y).toFixed(0)}`
          })
          .join(' ')
        ringStrings.push(pts)
      }
      const areaKm2 = polygonAreaKm2(f.geometry.coordinates)
      const nombreKey = (f.properties.nombre || '').trim().toUpperCase()
      const prod = prodByArea.get(nombreKey)
      // dailyGasDam3 = MMm³ × 1000 → dam³ (= mil m³). Easier to read at the
      // density scale than fractions of MMm³.
      const dailyGasDam3 = prod ? (prod.latestGas / daysInLatest) * 1000 : 0
      const dailyPetBbl = prod ? (prod.latestPet * M3_PER_BBL) / daysInLatest : 0
      const totals = totalByArea.get(nombreKey)
      const totalGas = totals?.gas ?? 0
      // Oil cumulative: m³ → MMbbl (millions of barrels). Loma Campana lifetime
      // is roughly 30 MMbbl after a few years of Vaca Muerta — easy to read.
      const totalPetMMbbl = totals ? (totals.pet * M3_PER_BBL) / 1_000_000 : 0
      const pozosAct = prod?.pozos ?? 0
      const pozosPerf = perf.byArea.get(nombreKey)?.pozos ?? 0
      return {
        feature: f,
        ringStrings,
        areaKm2,
        gasDailyDensity: areaKm2 > 0 ? dailyGasDam3 / areaKm2 : 0,
        petDailyDensity: areaKm2 > 0 ? dailyPetBbl / areaKm2 : 0,
        gasTotalDensity: areaKm2 > 0 ? totalGas / areaKm2 : 0,
        petTotalDensity: areaKm2 > 0 ? totalPetMMbbl / areaKm2 : 0,
        pozosActDensity: areaKm2 > 0 ? pozosAct / areaKm2 : 0,
        pozosPerfDensity: areaKm2 > 0 ? pozosPerf / areaKm2 : 0,
      }
    })
  }, [concesiones, prodByArea, totalByArea, perf, daysInLatest])

  // Quantile thresholds for the heatmap (one per palette step) — one set per
  // density mode so each gets its own legible scale.
  const heatBins = useMemo(() => {
    const quantiles = (arr: number[]): number[] => {
      const sorted = arr.filter((v) => v > 0).sort((a, b) => a - b)
      if (sorted.length === 0) return []
      const out: number[] = []
      for (let i = 1; i < HEAT_PALETTE.length; i++) {
        const idx = Math.floor((i * sorted.length) / HEAT_PALETTE.length)
        out.push(sorted[Math.min(idx, sorted.length - 1)])
      }
      return out
    }
    return {
      gas_prod: quantiles(projected.map((p) => p.gasDailyDensity)),
      pet_prod: quantiles(projected.map((p) => p.petDailyDensity)),
      gas_acum: quantiles(projected.map((p) => p.gasTotalDensity)),
      pet_acum: quantiles(projected.map((p) => p.petTotalDensity)),
      pozos_act: quantiles(projected.map((p) => p.pozosActDensity)),
      pozos_perf: quantiles(projected.map((p) => p.pozosPerfDensity)),
    }
  }, [projected])

  function densityColor(value: number, bins: number[]): string {
    if (value <= 0 || bins.length === 0) return NO_DATA
    let idx = 0
    while (idx < bins.length && value >= bins[idx]) idx++
    return HEAT_PALETTE[idx] ?? HEAT_PALETTE[HEAT_PALETTE.length - 1]
  }

  const matchedCount = useMemo(() => {
    let n = 0
    for (const p of projected) {
      if (prodByArea.has((p.feature.properties.nombre || '').trim().toUpperCase())) n++
    }
    return n
  }, [projected, prodByArea])

  const operatorList = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of projected) counts.set(p.feature.properties.operador, (counts.get(p.feature.properties.operador) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [projected])

  const hovered = projected.find((p) => p.feature.properties.id === hoverId)
  const hoveredKey = hovered ? (hovered.feature.properties.nombre || '').trim().toUpperCase() : ''
  const hoveredProd = hovered ? prodByArea.get(hoveredKey) : null
  const hoveredPerf = hovered ? perf.byArea.get(hoveredKey) : null

  // ----- mode-specific fill color -----
  function valueForMode(p: ProjectedFeature): number {
    if (mode === 'gas_prod') return p.gasDailyDensity
    if (mode === 'pet_prod') return p.petDailyDensity
    if (mode === 'gas_acum') return p.gasTotalDensity
    if (mode === 'pet_acum') return p.petTotalDensity
    if (mode === 'pozos_act') return p.pozosActDensity
    if (mode === 'pozos_perf') return p.pozosPerfDensity
    return 0
  }
  function binsForMode(): number[] {
    if (mode === 'gas_prod') return heatBins.gas_prod
    if (mode === 'pet_prod') return heatBins.pet_prod
    if (mode === 'gas_acum') return heatBins.gas_acum
    if (mode === 'pet_acum') return heatBins.pet_acum
    if (mode === 'pozos_act') return heatBins.pozos_act
    if (mode === 'pozos_perf') return heatBins.pozos_perf
    return []
  }
  function fillFor(p: ProjectedFeature): string {
    if (mode === 'operador') return operatorColor(p.feature.properties.operador)
    return densityColor(valueForMode(p), binsForMode())
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: space.sm,
          marginBottom: space.sm,
        }}
      >
        <div style={{ color: colors.textMuted, fontSize: 12 }}>
          {projected.length} concesiones — {matchedCount} con producción en {formatMes(latestMes)}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: colors.textDim, fontSize: 12, marginRight: 6 }}>colorear por:</span>
          {(
            [
              { id: 'operador', label: 'Operador' },
              { id: 'pozos_act', label: 'Pozos activos/km²' },
              ...(perf.byArea.size > 0
                ? [{ id: 'pozos_perf' as const, label: `Pozos perforados/km² (${PERF_WINDOW_MONTHS}m)` }]
                : []),
              { id: 'gas_prod', label: 'Productividad gas' },
              { id: 'pet_prod', label: 'Productividad petróleo' },
              {
                id: 'gas_acum',
                label: historicoRango
                  ? `Acumulado gas ${historicoRango.primer.slice(0, 4)}-${historicoRango.ultimo.slice(0, 4)}`
                  : 'Acumulado gas',
              },
              {
                id: 'pet_acum',
                label: historicoRango
                  ? `Acumulado petróleo ${historicoRango.primer.slice(0, 4)}-${historicoRango.ultimo.slice(0, 4)}`
                  : 'Acumulado petróleo',
              },
            ] as { id: Mode; label: string }[]
          ).map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)} style={modeBtn(mode === m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          {...handlers}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: 520,
            background: '#0b1220',
            borderRadius: radius.md,
            display: 'block',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          {projected.map((p) => {
            const { feature, ringStrings } = p
            const op = feature.properties.operador
            const fill = fillFor(p)
            const isPlus = op.startsWith('PLUSPETROL')
            const isHover = hoverId === feature.properties.id
            const stroke = isHover ? '#f1f5f9' : isPlus ? '#10b981' : '#0b1220'
            return (
              <g
                key={feature.properties.id || feature.properties.nombre}
                onMouseEnter={() => !isDragging && setHoverId(feature.properties.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
              >
                {ringStrings.map((pts, i) => (
                  <polygon
                    key={i}
                    points={pts}
                    fill={fill}
                    fillOpacity={isHover ? 0.9 : mode === 'operador' ? 0.55 : 0.78}
                    stroke={stroke}
                    strokeWidth={isHover ? 2 : isPlus ? 1.5 : 0.4}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )
          })}
        </svg>

        {/* Zoom controls overlay */}
        <div
          style={{
            position: 'absolute',
            top: space.sm,
            right: space.sm,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <button onClick={zoomIn} style={iconBtn} title="Acercar">＋</button>
          <button onClick={zoomOut} style={iconBtn} title="Alejar">－</button>
          <button onClick={reset} style={iconBtn} title="Reset">⟲</button>
        </div>

        {hovered && (
          <div
            style={{
              position: 'absolute',
              top: space.md,
              left: space.md,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              padding: `${space.sm}px ${space.md}px`,
              color: colors.textSecondary,
              fontSize: 12,
              maxWidth: 280,
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 13 }}>
              {shortBlock(hovered.feature.properties.nombre)}
            </div>
            <div style={{ color: operatorColor(hovered.feature.properties.operador), fontSize: 12, marginTop: 2 }}>
              {shortOperator(hovered.feature.properties.operador)}
            </div>
            {hoveredProd ? (
              <div style={{ marginTop: space.sm, lineHeight: 1.6 }}>
                <div>
                  Gas: <strong>{(hoveredProd.latestGas / daysInLatest).toFixed(2)}</strong> MMm³/d
                  <span style={{ color: colors.textDim }}> ({hoveredProd.latestGas.toFixed(0)} MMm³/mes)</span>
                </div>
                <div>
                  Petróleo: <strong>{((hoveredProd.latestPet * 6.2898) / daysInLatest / 1000).toFixed(2)}</strong> kbbl/d
                </div>
                <div>
                  Pozos activos: <strong>{hoveredProd.pozos}</strong>
                  <span style={{ color: colors.textDim }}> ({hovered.pozosActDensity.toFixed(3)}/km²)</span>
                </div>
                {hoveredPerf && hoveredPerf.pozos > 0 && (
                  <div>
                    Perforados {PERF_WINDOW_MONTHS}m: <strong>{hoveredPerf.pozos}</strong>
                    <span style={{ color: colors.textDim }}> ({hovered.pozosPerfDensity.toFixed(3)}/km²)</span>
                    <span style={{ color: colors.textDim, fontSize: 11 }}>
                      {' '}· {hoveredPerf.pet}p / {hoveredPerf.gas}g{hoveredPerf.serv > 0 ? ` / ${hoveredPerf.serv}s` : ''}
                    </span>
                  </div>
                )}
                <div style={{ color: colors.textDim, fontSize: 11, marginTop: 4 }}>
                  Área: {hovered.areaKm2.toFixed(0)} km²
                </div>
                <div style={{ color: colors.textDim, fontSize: 11 }}>
                  Gas: {hovered.gasDailyDensity.toFixed(2)} mil m³/d·km⁻² · Petróleo: {hovered.petDailyDensity.toFixed(0)} bbl/d·km⁻²
                </div>
                <div style={{ color: colors.textDim, fontSize: 11 }}>
                  Acumulado {historico && historico.length > 0 ? '(histórico)' : `(${monthsCoveredRecent}m)`}: gas {hovered.gasTotalDensity.toFixed(2)} MMm³·km⁻² · petróleo {hovered.petTotalDensity.toFixed(2)} MMbbl·km⁻²
                  {totalByArea.get((hovered.feature.properties.nombre || '').trim().toUpperCase())?.primer && (
                    <span> · desde {totalByArea.get((hovered.feature.properties.nombre || '').trim().toUpperCase())!.primer}</span>
                  )}
                </div>
                {hoveredProd.empresas.length > 1 && (
                  <div style={{ color: colors.textDim, fontSize: 11, marginTop: 2 }}>
                    Reportan: {hoveredProd.empresas.map(shortOperator).join(', ')}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: space.sm, color: colors.textDim }}>
                Sin producción reportada en {formatMes(latestMes)}.
                {hoveredPerf && hoveredPerf.pozos > 0 && (
                  <div style={{ marginTop: 4 }}>
                    Perforados {PERF_WINDOW_MONTHS}m: <strong>{hoveredPerf.pozos}</strong>
                    {' '}({hovered.pozosPerfDensity.toFixed(3)}/km²)
                  </div>
                )}
                <div style={{ fontSize: 11, marginTop: 4 }}>Área: {hovered.areaKm2.toFixed(0)} km²</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend — adapts to mode */}
      {mode === 'operador' ? (
        <div
          style={{
            display: 'flex',
            gap: space.sm,
            flexWrap: 'wrap',
            justifyContent: 'flex-start',
            marginTop: space.sm,
          }}
        >
          {operatorList.slice(0, 10).map(([op, n]) => (
            <span key={op} style={legendChip}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: operatorColor(op) }} />
              {shortOperator(op)} <span style={{ color: colors.textDim }}>({n})</span>
            </span>
          ))}
        </div>
      ) : (
        <HeatLegend
          bins={binsForMode()}
          unit={unitForMode(mode, historicoRango, monthsCoveredRecent, perf)}
        />
      )}

      <p style={{ color: colors.textDim, fontSize: 11, marginTop: space.sm, lineHeight: 1.5 }}>
        Wheel para zoom, click + arrastrar para mover. Áreas calculadas con proyección equirectangular local
        (precisión ~0.5 % para Neuquina).
      </p>
    </div>
  )
}

function unitForMode(
  mode: Mode,
  historicoRango: { primer: string; ultimo: string } | null,
  monthsCoveredRecent: number,
  perf: { primer: string | null; ultimo: string | null },
): string {
  if (mode === 'gas_prod') return 'mil m³/d · km⁻²'
  if (mode === 'pet_prod') return 'bbl/d · km⁻²'
  if (mode === 'pozos_act') return 'pozos activos · km⁻²'
  if (mode === 'pozos_perf') {
    const r = perf.primer && perf.ultimo ? ` (${perf.primer}…${perf.ultimo})` : ''
    return `pozos perforados · km⁻²${r}`
  }
  const rango = historicoRango
    ? `${historicoRango.primer.slice(0, 4)}-${historicoRango.ultimo.slice(0, 4)}`
    : `${monthsCoveredRecent}m`
  if (mode === 'gas_acum') return `MMm³ · km⁻² (${rango})`
  if (mode === 'pet_acum') return `MMbbl · km⁻² (${rango})`
  return ''
}

function HeatLegend({ bins, unit }: { bins: number[]; unit: string }) {
  if (bins.length === 0) return null
  const labels = formatBins(bins)
  return (
    <div
      style={{
        display: 'flex',
        gap: 1,
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginTop: space.sm,
      }}
    >
      <span style={{ color: colors.textDim, fontSize: 11, marginRight: 6 }}>{unit}</span>
      {HEAT_PALETTE.map((c, i) => (
        <span
          key={c}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: colors.textMuted,
            fontSize: 11,
            paddingRight: 6,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 10,
              background: c,
              borderRadius: 2,
            }}
          />
          {labels[i]}
        </span>
      ))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.textMuted, fontSize: 11 }}>
        <span style={{ display: 'inline-block', width: 14, height: 10, background: NO_DATA, borderRadius: 2 }} />
        sin datos
      </span>
    </div>
  )
}

function formatBins(bins: number[]): string[] {
  // bins has HEAT_PALETTE.length - 1 thresholds; produce HEAT_PALETTE.length labels.
  const labels: string[] = []
  const fmt = (v: number): string => {
    if (v === 0) return '0'
    if (v < 0.001) return v.toExponential(1)
    if (v < 1) return v.toFixed(3)
    if (v < 10) return v.toFixed(2)
    if (v < 100) return v.toFixed(1)
    return v.toFixed(0)
  }
  labels.push(`< ${fmt(bins[0])}`)
  for (let i = 1; i < bins.length; i++) labels.push(`${fmt(bins[i - 1])}+`)
  labels.push(`≥ ${fmt(bins[bins.length - 1])}`)
  return labels
}

const modeBtn = (active: boolean): React.CSSProperties => ({
  background: active ? colors.border : 'transparent',
  color: active ? colors.textPrimary : colors.textDim,
  border: 'none',
  borderRadius: radius.sm,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
})

const legendChip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  color: colors.textDim,
  fontSize: 11,
}

function formatMes(mes: string | null): string {
  if (!mes) return '—'
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1))
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function daysInMonth(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
