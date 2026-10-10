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
  estadoTgn?: string | null
  estadoTgs?: string | null
}

export default function PulseCard({ rows, estadoTgn, estadoTgs }: Props) {
  if (!rows || rows.length === 0) return null
  const today = rows[rows.length - 1]
  if (!today.fecha) return null

  const yesterday = rows.length > 1 ? rows[rows.length - 2] : null
  const mmdd = today.fecha.slice(5)

  // Recopilar valores históricos del mismo MMDD para el rango histórico
  const mmddPriorValues = { consumo: [] as number[], temp: [] as number[] }

  for (const row of rows) {
    if (!row.fecha || row.fecha.length < 10) continue
    if (row.fecha === today.fecha) continue
    const rowMmdd = row.fecha.slice(5)
    if (rowMmdd !== mmdd) continue
    if (typeof row.consumo_total_estimado === 'number') mmddPriorValues.consumo.push(row.consumo_total_estimado)
    const t = row.temperatura_ba?.tm
    if (typeof t === 'number') mmddPriorValues.temp.push(t)
  }

  const bullets: { label: string; value: string; sub?: string; color?: string }[] = []

  // 1. ESTADO TGN
  bullets.push({
    label: 'Estado TGN',
    value: estadoTgn || '-',
    sub: 'Sistema TGN',
    color: (estadoTgn || '').toLowerCase() === 'normal' ? colors.status.ok : colors.status.warn,
  })

  // 2. ESTADO TGS
  bullets.push({
    label: 'Estado TGS',
    value: estadoTgs || '-',
    sub: 'Sistema TGS',
    color: (estadoTgs || '').toLowerCase() === 'normal' ? colors.status.ok : colors.status.warn,
  })

  // 3. CONSUMO TOTAL (vs día anterior)
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
  } else {
    bullets.push({
      label: 'Consumo total',
      value: '-',
      color: colors.textDim,
    })
  }

  // 4. TEMP BA (vs día anterior)
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
  } else {
    bullets.push({
      label: 'Temp BA',
      value: '-',
      color: colors.textDim,
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
  } else {
    bullets.push({
      label: 'Δ Linepack ayer→hoy',
      value: '-',
      color: colors.textDim,
    })
  }

  // Fecha actual calculada dinámicamente estilo HOY() de Excel
  const currentDateLabel = getTodayFormatted()

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
            {currentDateLabel}
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

function getTodayFormatted(): string {
  const d = new Date()
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}
