import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts'
import { useProduccionNeuquina, useProduccionHistorico, useConcesionesNeuquina, usePlanesDesarrollo, usePozosTerminados } from '../hooks/useData'
import { card, colors, radius, sectionTitle, space } from '../theme'
import FreshnessBadge from './FreshnessBadge'
import { ChartSkeleton, SkeletonBlock } from './Skeleton'
import CuencaMap from './CuencaMap'
import PlanesDesarrolloTimeline from './PlanesDesarrolloTimeline'

// Top-N selection thresholds — keep visualizations legible without truncating
// the underlying table.
const TOP_BLOCKS_CHART = 6
const TABLE_ROWS = 20

// Operator palette (~10 colors). Pluspetrol intentionally green/contrast so the
// user can quickly spot their own blocks among the Vaca Muerta majors.
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
}
const FALLBACK_COLORS = ['#64748b', '#94a3b8', '#a3a3a3', '#737373', '#525252']
function operatorColor(name: string, fallbackIdx = 0): string {
  return OPERATOR_COLORS[name] ?? FALLBACK_COLORS[fallbackIdx % FALLBACK_COLORS.length]
}

// Short label for tooltip / axis: "PLUSPETROL S.A." -> "Pluspetrol", "YPF S.A." -> "YPF".
function shortOperator(name: string): string {
  const cleaned = name.replace(/S\.?A\.?R?\.?L?\.?$/i, '').replace(/SAU$/i, '').trim()
  if (cleaned.length <= 3) return cleaned
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1)))
    .join(' ')
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

function formatMes(mes: string): string {
  const [y, m] = mes.split('-').map((x) => Number(x))
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1))
  return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function daysInMonth(mes: string): number {
  const [y, m] = mes.split('-').map((x) => Number(x))
  return new Date(y, m, 0).getDate()
}

function ProduccionLoading() {
  return (
    <>
      <SkeletonBlock height={72} style={{ marginBottom: space.lg }} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: space.md,
          marginBottom: space.lg,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} height={100} />
        ))}
      </div>
      <ChartSkeleton height={320} />
    </>
  )
}

interface Kpi {
  label: string
  value: string
  hint?: string
  tone?: 'ok' | 'warn' | 'err' | null
}

function KpiTile({ k }: { k: Kpi }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        padding: space.lg,
      }}
    >
      <div style={{ color: colors.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {k.label}
      </div>
      <div
        style={{
          color: k.tone === 'ok' ? colors.status.ok : k.tone === 'err' ? colors.status.err : colors.textPrimary,
          fontSize: 24,
          fontWeight: 700,
          marginTop: 4,
        }}
      >
        {k.value}
      </div>
      {k.hint && (
        <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{k.hint}</div>
      )}
    </div>
  )
}

type SortKey = 'gas' | 'pet' | 'pozos' | 'gas_yoy'

export default function ProduccionPage() {
  const state = useProduccionNeuquina()
  const historicoState = useProduccionHistorico()
  const concesionesState = useConcesionesNeuquina()
  const perforacionesState = usePozosTerminados()
  const planesState = usePlanesDesarrollo()
  const [sortKey, setSortKey] = useState<SortKey>('gas')

  const rows = state.data ?? []

  // Derive: months sorted, latest month rows, prior-year rows, per-block aggregates.
  const months = useMemo(() => Array.from(new Set(rows.map((r) => r.mes))).sort(), [rows])
  const latestMes = months[months.length - 1] ?? null
  const priorYearMes = useMemo(() => {
    if (!latestMes) return null
    const [y, m] = latestMes.split('-').map(Number)
    return `${y - 1}-${String(m).padStart(2, '0')}`
  }, [latestMes])

  // Aggregate over (area, empresa) for latest and prior-year months.
  const latestRows = useMemo(() => rows.filter((r) => r.mes === latestMes), [rows, latestMes])
  const priorYearByBlock = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (r.mes !== priorYearMes) continue
      const key = `${r.area}${r.empresa}`
      m.set(key, (m.get(key) ?? 0) + r.prod_gas_mm3)
    }
    return m
  }, [rows, priorYearMes])

  const tableRows = useMemo(() => {
    return latestRows
      .map((r) => {
        const prior = priorYearByBlock.get(`${r.area}${r.empresa}`) ?? null
        const yoy = prior != null && prior > 0 ? (r.prod_gas_mm3 - prior) / prior : null
        return { ...r, gas_yoy: yoy }
      })
      .sort((a, b) => {
        if (sortKey === 'gas') return b.prod_gas_mm3 - a.prod_gas_mm3
        if (sortKey === 'pet') return b.prod_pet_m3 - a.prod_pet_m3
        if (sortKey === 'pozos') return b.pozos_activos - a.pozos_activos
        if (sortKey === 'gas_yoy') return (b.gas_yoy ?? -Infinity) - (a.gas_yoy ?? -Infinity)
        return 0
      })
  }, [latestRows, priorYearByBlock, sortKey])

  // Time series for the top blocks (by latest-month gas), one line per block.
  const topBlockKeys = useMemo(() => {
    return [...latestRows]
      .sort((a, b) => b.prod_gas_mm3 - a.prod_gas_mm3)
      .slice(0, TOP_BLOCKS_CHART)
      .map((r) => r.area)
  }, [latestRows])

  const chartByMonth = useMemo(() => {
    const out: Record<string, Record<string, number>> = {}
    for (const m of months) out[m] = {}
    for (const r of rows) {
      if (!topBlockKeys.includes(r.area)) continue
      const slot = out[r.mes]
      if (slot) slot[r.area] = (slot[r.area] ?? 0) + r.prod_gas_mm3
    }
    return months.map((m) => ({ mes: m, ...out[m] }))
  }, [months, rows, topBlockKeys])

  // Stacked bar: operator share of total gas per month (top 8 operators across
  // all months by total gas, plus "Otros").
  const operatorsByGas = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of rows) totals.set(r.empresa, (totals.get(r.empresa) ?? 0) + r.prod_gas_mm3)
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }, [rows])

  const topOperators = operatorsByGas.slice(0, 8)
  const operatorSeries = useMemo(() => {
    return months.map((m) => {
      const slot: Record<string, number | string> = { mes: m }
      let otros = 0
      for (const r of rows.filter((x) => x.mes === m)) {
        if (topOperators.includes(r.empresa)) {
          slot[r.empresa] = ((slot[r.empresa] as number | undefined) ?? 0) + r.prod_gas_mm3
        } else {
          otros += r.prod_gas_mm3
        }
      }
      if (otros > 0) slot['Otros'] = otros
      return slot
    })
  }, [months, rows, topOperators])

  if (state.loading) return <ProduccionLoading />
  if (state.error) {
    return (
      <div style={{ ...card, color: colors.status.err }}>
        No se pudo cargar produccion_neuquina.json: {state.error.message}
      </div>
    )
  }
  if (!latestMes) {
    return (
      <div style={{ ...card, color: colors.textMuted }}>
        Sin datos de Capítulo IV todavía. Corré <code>scripts/fetch_capiv.py</code>.
      </div>
    )
  }

  const days = daysInMonth(latestMes)
  const totalGas = latestRows.reduce((s, r) => s + r.prod_gas_mm3, 0)
  const totalPet = latestRows.reduce((s, r) => s + r.prod_pet_m3, 0)
  const totalAgua = latestRows.reduce((s, r) => s + r.prod_agua_m3, 0)
  const totalPozos = latestRows.reduce((s, r) => s + r.pozos_activos, 0)
  const totalPriorGas = [...priorYearByBlock.values()].reduce((s, v) => s + v, 0)
  const yoyPct = totalPriorGas > 0 ? ((totalGas - totalPriorGas) / totalPriorGas) * 100 : null

  const totalBlocks = new Set(latestRows.map((r) => r.area)).size
  const PETROLEO_BBL_POR_M3 = 6.2898 // industry conversion
  const totalKbpd = (totalPet * PETROLEO_BBL_POR_M3) / days / 1000

  const kpis: Kpi[] = [
    {
      label: 'Producción de gas',
      value: `${(totalGas / days).toFixed(1)} MMm³/d`,
      hint: `${totalGas.toFixed(0)} MMm³ en ${formatMes(latestMes)}`,
    },
    {
      label: 'Producción de petróleo',
      value: `${totalKbpd.toFixed(1)} kbbl/d`,
      hint: `${(totalPet / 1000).toFixed(0)} mil m³ en el mes`,
    },
    {
      label: 'Bloques activos',
      value: `${totalBlocks}`,
      hint: `${totalPozos.toLocaleString('es-AR')} pozos con producción`,
    },
    {
      label: 'Variación interanual gas',
      value: yoyPct == null ? '—' : `${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(1)}%`,
      hint: priorYearMes ? `vs. ${formatMes(priorYearMes)}` : undefined,
      tone: yoyPct == null ? null : yoyPct >= 0 ? 'ok' : 'err',
    },
  ]

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: space.md,
          marginBottom: space.md,
        }}
      >
        <div>
          <h1 style={{ fontSize: 'clamp(20px, 3.5vw, 28px)', fontWeight: 700, color: colors.textPrimary }}>
            Producción upstream — Cuenca Neuquina
          </h1>
          <p style={{ color: colors.textDim, fontSize: 14, marginTop: 4 }}>
            Datos mensuales del Capítulo IV (Secretaría de Energía). Agregado por bloque + operador.
          </p>
        </div>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <p style={{ color: colors.textDim, fontSize: 12 }}>Último mes</p>
          <p style={{ color: colors.textSecondary, fontSize: 14, fontWeight: 600 }}>{formatMes(latestMes)}</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
            <FreshnessBadge label="Cap IV" generatedAt={state.meta.generated_at} />
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: space.md,
          marginBottom: space.xl,
        }}
      >
        {kpis.map((k) => (
          <KpiTile key={k.label} k={k} />
        ))}
      </div>

      <div style={{ ...card, marginBottom: space.xl }}>
        <h3 style={sectionTitle}>Mapa de concesiones — Cuenca Neuquina</h3>
        {concesionesState.loading ? (
          <ChartSkeleton height={400} />
        ) : concesionesState.error || !concesionesState.data ? (
          <div style={{ color: colors.textMuted, fontSize: 13 }}>
            No se pudo cargar el mapa de concesiones
            {concesionesState.error ? `: ${concesionesState.error.message}` : '.'} Corré{' '}
            <code>scripts/fetch_concesiones_geojson.py</code> para generar el archivo.
          </div>
        ) : (
          <CuencaMap
            concesiones={concesionesState.data}
            produccion={rows}
            historico={historicoState.data}
            perforaciones={perforacionesState.data}
            latestMes={latestMes}
          />
        )}
      </div>

      <div style={{ ...card, marginBottom: space.xl }}>
        <h3 style={sectionTitle}>Top {TOP_BLOCKS_CHART} bloques por gas — evolución mensual</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartByMonth}>
            <CartesianGrid stroke={colors.border} strokeDasharray="3 3" />
            <XAxis dataKey="mes" tickFormatter={formatMes} tick={{ fill: colors.textDim, fontSize: 11 }} />
            <YAxis
              tick={{ fill: colors.textDim, fontSize: 11 }}
              label={{ value: 'MMm³/mes', angle: -90, position: 'insideLeft', fill: colors.textDim, fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.md }}
              labelStyle={{ color: colors.textMuted }}
              labelFormatter={(m: string) => formatMes(m)}
              formatter={(v: number, name: string) => [`${v?.toFixed?.(0) ?? v} MMm³`, shortBlock(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => shortBlock(v)} />
            {topBlockKeys.map((block, i) => (
              <Line
                key={block}
                type="monotone"
                dataKey={block}
                stroke={FALLBACK_COLORS_BLOCKS[i % FALLBACK_COLORS_BLOCKS.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...card, marginBottom: space.xl }}>
        <h3 style={sectionTitle}>Participación de operadores — gas total mensual</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={operatorSeries}>
            <CartesianGrid stroke={colors.border} strokeDasharray="3 3" />
            <XAxis dataKey="mes" tickFormatter={formatMes} tick={{ fill: colors.textDim, fontSize: 11 }} />
            <YAxis
              tick={{ fill: colors.textDim, fontSize: 11 }}
              label={{ value: 'MMm³/mes', angle: -90, position: 'insideLeft', fill: colors.textDim, fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.md }}
              labelStyle={{ color: colors.textMuted }}
              labelFormatter={(m: string) => formatMes(m)}
              formatter={(v: number, name: string) => [`${v?.toFixed?.(0) ?? v} MMm³`, shortOperator(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => shortOperator(v)} />
            {topOperators.map((op, i) => (
              <Bar
                key={op}
                dataKey={op}
                stackId="op"
                fill={operatorColor(op, i)}
                isAnimationActive={false}
              />
            ))}
            <Bar dataKey="Otros" stackId="op" fill={colors.accent.gray} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md }}>
          <h3 style={{ ...sectionTitle, marginBottom: 0 }}>
            Bloques de Neuquina — {formatMes(latestMes)}
          </h3>
          <div style={{ color: colors.textDim, fontSize: 12 }}>
            ordenar por:{' '}
            {(['gas', 'pet', 'pozos', 'gas_yoy'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                style={{
                  background: sortKey === k ? colors.border : 'transparent',
                  color: sortKey === k ? colors.textPrimary : colors.textDim,
                  border: 'none',
                  borderRadius: radius.sm,
                  padding: '2px 8px',
                  marginLeft: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {k === 'gas' ? 'gas' : k === 'pet' ? 'petróleo' : k === 'pozos' ? 'pozos' : 'YoY gas'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: colors.textMuted, textAlign: 'left' }}>
                <th style={th}>Bloque</th>
                <th style={th}>Operador</th>
                <th style={thNum}>Gas (MMm³/mes)</th>
                <th style={thNum}>MMm³/d</th>
                <th style={thNum}>Petróleo (m³/mes)</th>
                <th style={thNum}>Pozos activos</th>
                <th style={thNum}>YoY gas</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(0, TABLE_ROWS).map((r, i) => {
                const isPluspetrol = r.empresa.startsWith('PLUSPETROL')
                return (
                  <tr
                    key={`${r.area}-${r.empresa}-${i}`}
                    style={{
                      borderTop: `1px solid ${colors.border}`,
                      background: isPluspetrol ? colors.status.ok + '12' : 'transparent',
                    }}
                  >
                    <td style={td}>{shortBlock(r.area)}</td>
                    <td style={{ ...td, color: operatorColor(r.empresa) }}>
                      {shortOperator(r.empresa)}
                    </td>
                    <td style={tdNum}>{r.prod_gas_mm3.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                    <td style={tdNum}>{(r.prod_gas_mm3 / days).toFixed(2)}</td>
                    <td style={tdNum}>{r.prod_pet_m3.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                    <td style={tdNum}>{r.pozos_activos.toLocaleString('es-AR')}</td>
                    <td style={{
                      ...tdNum,
                      color: r.gas_yoy == null
                        ? colors.textDim
                        : r.gas_yoy >= 0 ? colors.status.ok : colors.status.err,
                    }}>
                      {r.gas_yoy == null ? '—' : `${r.gas_yoy >= 0 ? '+' : ''}${(r.gas_yoy * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ color: colors.textDim, fontSize: 11, marginTop: space.md }}>
          Total agua del mes: {(totalAgua / 1000).toFixed(0)} mil m³. Fuente:
          {' '}
          <a href="https://datos.energia.gob.ar/dataset/produccion-de-petroleo-y-gas-por-pozo" target="_blank" rel="noreferrer" style={{ color: colors.accent.blue }}>
            datos.energia.gob.ar — Capítulo IV
          </a>.
        </p>
      </div>

      <div style={{ ...card, marginTop: space.xl }}>
        <h3 style={sectionTitle}>Planes de desarrollo anunciados</h3>
        {planesState.loading ? (
          <SkeletonBlock height={120} />
        ) : planesState.error || !planesState.data ? (
          <div style={{ color: colors.textMuted, fontSize: 13 }}>
            No se pudo cargar planes_desarrollo.json
            {planesState.error ? `: ${planesState.error.message}` : '.'}
          </div>
        ) : (
          <PlanesDesarrolloTimeline planes={planesState.data} />
        )}
      </div>
    </>
  )
}

const FALLBACK_COLORS_BLOCKS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#fbbf24']

const th: React.CSSProperties = {
  padding: `${space.sm}px ${space.md}px`,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  fontWeight: 600,
}
const thNum: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = {
  padding: `${space.sm}px ${space.md}px`,
  color: colors.textSecondary,
}
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
