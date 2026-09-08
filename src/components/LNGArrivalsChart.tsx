import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { colors } from '../theme'
import { formatTooltipDate } from '../utils/charts'

interface Importacion {
  programa?: number | null
  proximo_barco?: string | null
}

interface RDSRow {
  fecha?: string
  importaciones?: {
    escobar?: Importacion
  }
}

interface Props {
  rows: RDSRow[]
}

/** Días a proyectar hacia adelante sosteniendo el último programa de regas. */
const HORIZON = 7

/** Suma n días a una fecha ISO (YYYY-MM-DD) en UTC para evitar corrimientos de zona horaria. */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Regasification volume for the Escobar LNG port over time. During winter
 * (may-aug) the RDS reports non-zero "programa" values when LNG cargoes are
 * being regasified; off-season the values are zero, in which case we show the
 * placeholder rather than a chart of historical winter peaks.
 *
 * Bahía Blanca fue removido: la terminal ya no opera (programa siempre 0).
 *
 * Proyección: no hay manifiesto de barcos futuros con volumen, así que
 * extendemos el último `programa` del RDS ~7 días como línea punteada
 * ("programado"). Es el plan que publica ENARGAS y coincide con el cierre real;
 * los cargamentos futuros pueden variar.
 */
export default function LNGArrivalsChart({ rows }: Props) {
  const sorted = rows
    .filter((r): r is RDSRow & { fecha: string } => typeof r.fecha === 'string')
    .map((r) => ({
      fecha: r.fecha,
      escobar: r.importaciones?.escobar?.programa ?? null,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  // Render only the last 60 days, matching the operational horizon. Showing
  // the entire 2-year history alongside 7d charts confused dispatch readers.
  const recent = sorted.slice(-14)
  const hasRecentActivity = recent.some((r) => (r.escobar ?? 0) > 0)
  if (!hasRecentActivity) {
    const nonZero = sorted.filter((r) => (r.escobar ?? 0) > 0)
    const lastNonZero = nonZero.length > 0 ? nonZero[nonZero.length - 1] : null
    return (
      <p style={{ color: colors.textDim, fontSize: 13 }}>
        Sin regasificación activa en los últimos 14 días.{' '}
        {lastNonZero ? `Último cargamento programado: ${lastNonZero.fecha}.` : ''}{' '}
        El puerto GNL Escobar opera típicamente entre mayo y agosto.
      </p>
    )
  }

  const hist = sorted.slice(-60).map((r) => ({
    fecha: r.fecha,
    escobar: r.escobar,
    escobar_est: null as number | null,
  }))

  // Ancla de la proyección = último día con programa real. Sirve de puente para
  // que el punteado enganche con la línea sólida y de posición de la línea "Hoy".
  let anchorIdx = -1
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].escobar != null) {
      anchorIdx = i
      break
    }
  }
  const anchor = anchorIdx >= 0 ? hist[anchorIdx] : null
  let projection: typeof hist = []
  if (anchor && anchor.escobar != null) {
    const level = anchor.escobar
    anchor.escobar_est = level // puente en el borde real→proyección
    projection = Array.from({ length: HORIZON }, (_, i) => ({
      fecha: addDays(anchor.fecha, i + 1),
      escobar: null as number | null,
      escobar_est: level,
    }))
  }
  const data = [...hist, ...projection]
  const lastHistorical = anchor?.fecha ?? ''

  const fmt = (d: string) => d.slice(5)

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} syncId="outlook">
        <XAxis dataKey="fecha" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" minTickGap={30} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} unit=" MMm³/d" />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={formatTooltipDate}
          formatter={(v: number, name: string) => (v != null ? [`${v.toFixed(1)} MMm³/d`, name] : ['-', name])}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lastHistorical && projection.length > 0 && (
          <ReferenceLine x={lastHistorical} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'Hoy', fill: '#64748b', fontSize: 10 }} />
        )}
        <Line type="monotone" dataKey="escobar" stroke={colors.accent.orange} strokeWidth={2} dot={false} name="GNL Escobar" connectNulls={false} />
        <Line type="monotone" dataKey="escobar_est" stroke={colors.accent.orange} strokeWidth={2} strokeDasharray="5 4" dot={false} name="Escobar (programado)" legendType="none" connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
