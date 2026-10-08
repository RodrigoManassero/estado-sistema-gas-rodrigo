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
  importaciones?: {
    escobar?: Importacion
    bahia_blanca?: Importacion
  }
  [k: string]: unknown
}

interface SystemStatus {
  fecha?: string | null
  tgn?: string | null
  tgs?: string | null
}

interface Props {
  rows: RDSRow[]
  systemStatus?: SystemStatus | null
}

// Función helper para mapear los colores según el estado del sistema
function getStatusColor(status?: string | null): string {
  if (!status) return colors.textPrimary
  const s = status.toUpperCase()
  if (s === 'NORMAL') return colors.status.ok // Verde
  if (s === 'ALERTA') return colors.status.warn // Amarillo / Naranja
  if (s === 'CRITICO' || s === 'EMERGENCIA') return colors.status.err // Rojo
  return colors.textPrimary
}

export default function PulseCard({ rows, systemStatus }: Props) {
  if (!rows || rows.length === 0) return null
  const today = rows[rows.length - 1]
  if (!today.fecha) return null

  const yesterday = rows.length > 1 ? rows[rows.length - 2] : null
  const mmdd = today.fecha.slice(5)

  // Recopilar valores históricos del mismo MMDD para el rango histórico de temperatura
  const mmddPriorValues = { temp: [] as number[] }

  for (const row of rows) {
    if (!row.fecha || row.fecha.length < 10) continue
    if (row.fecha === today.fecha) continue
    if (row.fecha.slice(5) !== mmdd) continue
    const t = row.temperatura_ba?.tm
    if (typeof t === 'number') mmddPriorValues.temp.push(t)
  }

  const bullets: { label: string; value: string; sub?: string; color?: string }[] = []

  // 1. CONSUMO TOTAL (vs día anterior)
  if (today.consumo_total_estimado != null) {
    let subConsumo: string | undefined
    if (yesterday && yesterday.consumo_total_estimado != null && yesterday.consumo_total_estimado > 0) {
      const diff = today.consumo_total_estimado - yesterday.consumo_total_estimado
      const pct = (diff / yesterday.consumo_total_estimado) * 100
      const sign = pct >= 0 ? '+' : ''
      subConsumo = `${sign}${pct.toFixed(1)}% vs ayer`
    }

    bullets.push({
      label: 'Consumo total',
      value: `${today.consumo_total_estimado.toFixed(1)} MMm³/d`,
      sub: subConsumo,
      color: colors.accent.orange,
    })
  }

  // 2. TEMP BA (vs día anterior)
  const tempToday = today.temperatura_ba?.tm
  if (typeof tempToday === 'number') {
    let subTemp: string | undefined
    const tempYesterday = yesterday?.temperatura_ba?.tm

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

  // 3. ESTADO SISTEMA TGN
  if (systemStatus?.tgn) {
    bullets.push({
      label: 'Estado Sistema TGN',
      value: systemStatus.tgn.toUpperCase(),
      color: getStatusColor(systemStatus.tgn),
    })
  }

  // 4. ESTADO SISTEMA TGS
  if (systemStatus?.tgs) {
    bullets.push({
      label: 'Estado Sistema TGS',
      value: systemStatus.tgs.toUpperCase(),
      color: getStatusColor(systemStatus.tgs),
    })
  }

  // 5. Δ LINEPACK AYER → HOY
  if (today.linepack_delta != null) {
    const deltaColor = today.linepack_delta >= 0 ? colors.status.ok : colors.status.err
    bullets.push({
      label: 'Δ Linepack ayer→hoy',
      value: `${today.linepack_delta >= 0 ? '+' : ''}${today.linepack_delta.toFixed(1)} MMm³`,
      color: deltaColor,
    })
  }

  // 6. REGASIFICACIÓN / BARCOS GNL (si aplica)
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}
