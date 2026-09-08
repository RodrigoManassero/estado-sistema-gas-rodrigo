import { colors, radius, space } from '../theme'

interface Importacion {
  programa?: number | null
  proximo_barco?: string | null
}

interface RDSRow {
  fecha?: string
  linepack_total?: number | null
  linepack_delta?: number | null
  consumo_total_estimado?: number | null
  temperatura_ba?: { tm?: number | null } | null
  forecast_temp_ba?: Array<{ fecha: string; min?: number | null; max?: number | null; tm?: number | null }> | null
  importaciones?: {
    escobar?: Importacion
    bahia_blanca?: Importacion
  }
  [k: string]: unknown
}

interface Props {
  rows: RDSRow[]
}

/**
 * "What's the story today?" — top-of-dashboard one-liner summary with
 * historical context. Uses the backfilled RDS history to say things like
 * "linepack hoy: 355 (+2% vs 2025-mismo-día, en rango normal)".
 */
export default function PulseCard({ rows }: Props) {
  if (!rows || rows.length === 0) return null
  const today = rows[rows.length - 1]
  if (!today.fecha) return null

  const mmdd = today.fecha.slice(5)
  const currentYear = today.fecha.slice(0, 4)

  // Same-date prior-year lookups.
  const priorByYear = new Map<string, RDSRow>()
  const mmddPriorValues = { linepack: [] as number[], consumo: [] as number[], temp: [] as number[] }

  for (const row of rows) {
    if (!row.fecha || row.fecha.length < 10) continue
    if (row.fecha === today.fecha) continue
    const rowMmdd = row.fecha.slice(5)
    if (rowMmdd !== mmdd) continue
    priorByYear.set(row.fecha.slice(0, 4), row)
    if (typeof row.linepack_total === 'number') mmddPriorValues.linepack.push(row.linepack_total)
    if (typeof row.consumo_total_estimado === 'number') mmddPriorValues.consumo.push(row.consumo_total_estimado)
    const t = row.temperatura_ba?.tm
    if (typeof t === 'number') mmddPriorValues.temp.push(t)
  }

  const lastYear = priorByYear.get(String(Number(currentYear) - 1))

  // Cold peak in the 6-day forecast (ENARGAS bakes this into each daily RDS).
  const peak = (today.forecast_temp_ba ?? []).reduce<{ fecha: string; min: number } | null>(
    (acc, d) => (d.min != null && (!acc || d.min < acc.min) ? { fecha: d.fecha, min: d.min } : acc),
    null,
  )

  const bullets: { label: string; value: string; sub?: string; color?: string }[] = []

  if (today.linepack_total != null) {
    bullets.push({
      label: 'Linepack total',
      value: `${today.linepack_total.toFixed(1)} MMm³`,
      sub: deltaVsPrior('linepack', today.linepack_total, lastYear?.linepack_total, mmddPriorValues.linepack),
      color: colors.accent.blue,
    })
  }

  if (today.consumo_total_estimado != null) {
    bullets.push({
      label: 'Consumo total',
      value: `${today.consumo_total_estimado.toFixed(1)} MMm³/d`,
      sub: deltaVsPrior('consumo', today.consumo_total_estimado, lastYear?.consumo_total_estimado, mmddPriorValues.consumo),
      color: colors.accent.orange,
    })
  }

  const tempToday = today.temperatura_ba?.tm
  if (typeof tempToday === 'number') {
    bullets.push({
      label: 'Temp BA',
      value: `${tempToday.toFixed(0)}°C`,
      sub: deltaVsPrior('temp', tempToday, lastYear?.temperatura_ba?.tm ?? null, mmddPriorValues.temp, '°C'),
      color: colors.accent.purple,
    })
  }

  if (peak) {
    const peakDate = new Date(peak.fecha + 'T12:00:00')
    const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
    bullets.push({
      label: 'Próximo pico de frío (6d)',
      value: `${peak.min.toFixed(0)}°C`,
      sub: `${days[peakDate.getDay()]} ${peakDate.getDate()}/${peakDate.getMonth() + 1}`,
      color: colors.status.warn,
    })
  }

  if (today.linepack_delta != null) {
    const deltaColor = today.linepack_delta >= 0 ? colors.status.ok : colors.status.err
    bullets.push({
      label: 'Δ Linepack ayer→hoy',
      value: `${today.linepack_delta >= 0 ? '+' : ''}${today.linepack_delta.toFixed(1)} MMm³`,
      color: deltaColor,
    })
  }

  // Regasificación activa hoy + fecha del próximo cargamento si está programado.
  const regasEsc = today.importaciones?.escobar?.programa ?? 0
  const regasBB = today.importaciones?.bahia_blanca?.programa ?? 0
  const regasTotal = regasEsc + regasBB
  if (regasTotal > 0) {
    bullets.push({
      label: 'Regasificación LNG hoy',
      value: `${regasTotal.toFixed(1)} MMm³/d`,
      sub: [
        regasEsc > 0 ? `Escobar ${regasEsc.toFixed(1)}` : null,
        regasBB > 0 ? `B.Blanca ${regasBB.toFixed(1)}` : null,
      ].filter(Boolean).join(' · '),
      color: colors.accent.purple,
    })
  }
  const nextEsc = today.importaciones?.escobar?.proximo_barco
  const nextBB = today.importaciones?.bahia_blanca?.proximo_barco
  if (nextEsc || nextBB) {
    bullets.push({
      label: 'Próximo barco GNL',
      value: [
        nextEsc ? `Escobar ${nextEsc}` : null,
        nextBB ? `B.Blanca ${nextBB}` : null,
      ].filter(Boolean).join(' · '),
      color: colors.accent.orange,
    })
  }

  if (bullets.length === 0) return null

  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: radius.lg,
        padding: `${space.lg}px ${space.xl}px`,
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.accent.blue}`,
        marginTop: space.lg,
      }}
    >
      <div
        style={{
          color: colors.textMuted,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          marginBottom: space.sm,
        }}
      >
        Hoy en 30 segundos
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: space.md,
        }}
      >
        {bullets.map((b) => (
          <div key={b.label}>
            <div style={{ color: colors.textDim, fontSize: 11 }}>{b.label}</div>
            <div style={{ color: b.color ?? colors.textPrimary, fontSize: 22, fontWeight: 700, marginTop: 2 }}>
              {b.value}
            </div>
            {b.sub && <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{b.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function deltaVsPrior(
  kind: 'linepack' | 'consumo' | 'temp',
  current: number,
  lastYear: number | null | undefined,
  historical: number[],
  unit = '',
): string | undefined {
  const parts: string[] = []

  if (typeof lastYear === 'number') {
    const diff = current - lastYear
    const pct = (diff / lastYear) * 100
    const sign = diff >= 0 ? '+' : ''
    if (kind === 'temp') {
      parts.push(`${sign}${diff.toFixed(1)}${unit} vs 2025`)
    } else {
      parts.push(`${sign}${pct.toFixed(1)}% vs 2025`)
    }
  }

  if (historical.length >= 2) {
    const min = Math.min(...historical)
    const max = Math.max(...historical)
    const inRange = current >= min && current <= max
    if (!inRange) {
      parts.push(current > max ? `sobre rango hist (${max.toFixed(1)})` : `bajo rango hist (${min.toFixed(1)})`)
    }
  }

  return parts.length > 0 ? parts.join(' · ') : undefined
}
