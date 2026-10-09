import { colors, radius, space } from '../theme'
import type { DailyRow } from '../types'

interface Props {
  rows: DailyRow[]
}

export default function PulseCard({ rows }: Props) {
  if (!rows || rows.length === 0) return null
  const today = rows[rows.length - 1]
  if (!today.fecha) return null

  const yesterday = rows.length > 1 ? rows[rows.length - 2] : null
  const mmdd = today.fecha.slice(5)

  // Rango histórico para la misma fecha MMDD
  const mmddPriorValues = { consumo: [] as number[], temp: [] as number[] }

  for (const row of rows) {
    if (!row.fecha || row.fecha.length < 10) continue
    if (row.fecha === today.fecha) continue
    if (row.fecha.slice(5) !== mmdd) continue
    if (typeof row.demanda_total === 'number') mmddPriorValues.consumo.push(row.demanda_total)
    const t = row.temp_prom_ba
    if (typeof t === 'number') mmddPriorValues.temp.push(t)
  }

  const bullets: { label: string; value: string; sub?: string; color?: string }[] = []

  // 0. ESTADO TGN & ESTADO TGS (Tomados directamente de daily.json)
  const estadoTgn = today.estado_tgn ?? 'N/D'
  const estadoTgs = today.estado_tgs ?? 'N/D'

  bullets.push({
    label: 'ESTADO TGN',
    value: estadoTgn,
    color: getStateColor(estadoTgn),
  })

  bullets.push({
    label: 'ESTADO TGS',
    value: estadoTgs,
    color: getStateColor(estadoTgs),
  })

  // 1. CONSUMO TOTAL (vs día anterior)
  if (today.demanda_total != null) {
    let subConsumo: string | undefined
    if (yesterday && yesterday.demanda_total != null && yesterday.demanda_total > 0) {
      const diff = today.demanda_total - yesterday.demanda_total
      const pct = (diff / yesterday.demanda_total) * 100
      const sign = pct >= 0 ? '+' : ''
      subConsumo = `${sign}${pct.toFixed(1)}% vs ayer`
    }

    bullets.push({
      label: 'Consumo total',
      value: `${today.demanda_total.toFixed(1)} MMm³/d`,
      sub: subConsumo,
      color: colors.accent.orange,
    })
  }

  // 2. TEMP BA (vs día anterior)
  const tempToday = today.temp_prom_ba
  if (typeof tempToday === 'number') {
    let subTemp: string | undefined
    const tempYesterday = yesterday?.temp_prom_ba

    if (typeof tempYesterday === 'number') {
      const diff = tempToday - tempYesterday
      const sign = diff >= 0 ? '+' : ''
      subTemp = `${sign}${diff.toFixed(1)}°C vs ayer`

      if (mmddPriorValues.temp.length >= 2) {
        const min = Math.min(...mmddPriorValues.temp)
        const max = Math.max(...mmddPriorValues.temp)
        if (tempToday < min) {
          subTemp += ` · bajo rango hist (${min.toFixed(1)})`
        } else if (tempToday > max) {
          subTemp += ` · sobre rango hist (${max.toFixed(1)})`
        }
      }
    }

    bullets.push({
      label: 'Temp BA',
      value: `${tempToday.toFixed(0)}°C`,
      sub: subTemp,
      color: colors.accent.purple,
    })
  }

  // 3. Δ LINEPACK TOTAL AYER → HOY
  if (today.var_linepack_total != null) {
    const deltaColor = today.var_linepack_total >= 0 ? colors.status.ok : colors.status.err
    bullets.push({
      label: 'Δ Linepack total',
      value: `${today.var_linepack_total >= 0 ? '+' : ''}${today.var_linepack_total.toFixed(1)} MMm³`,
      color: deltaColor,
    })
  }

  if (bullets.length === 0) return null

  const dateLabel = formatDate(today.fecha)

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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.md, marginBottom: space.md }}>
        <div>
          <div
            style={{
              color: colors.accent.blue,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            HOY
          </div>
          <div style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {dateLabel}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: space.md,
        }}
      >
        {bullets.map((b) => (
          <div key={b.label}>
            <div style={{ color: colors.textDim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {b.label}
            </div>
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

function getStateColor(state: string): string {
  const upper = state.toUpperCase()
  if (upper.includes('NORMAL')) return colors.status.ok // Verde
  if (upper.includes('ALERTA') || upper.includes('RESTRINGIDO')) return colors.status.err // Rojo/Naranja de alerta
  return colors.accent.orange
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}
