import { useDemandForecast, useWeather, useEnargasRDS } from '../hooks/useData'
import { card, colors, space } from '../theme'

// Operational T+1 card: demand expectation, temp, and risk semaphore for
// tomorrow. Uses demand_forecast.json + weather.json + last RDS for delta.
export default function TomorrowCard() {
  const fc = useDemandForecast()
  const weather = useWeather()
  const rds = useEnargasRDS()

  const todayISO = new Date().toISOString().slice(0, 10)
  const tomorrow = nextISODay(todayISO)

  const fcTomorrow = fc.data?.forecast.find((d) => d.fecha === tomorrow)
  const fcToday = fc.data?.forecast.find((d) => d.fecha === todayISO)
  const wxTomorrow = weather.data?.forecast.find((d) => d.fecha === tomorrow)

  const rdsRows = rds.data ?? []
  const lastRDS = rdsRows[rdsRows.length - 1]
  const linepackToday = lastRDS?.linepack_total ?? null

  if (!fcTomorrow && !wxTomorrow) {
    return null
  }

  const totalEst = fcTomorrow?.demanda_total_est ?? null
  const totalToday = fcToday?.demanda_total_est ?? null
  const deltaPct = totalEst != null && totalToday != null && totalToday > 0
    ? ((totalEst - totalToday) / totalToday) * 100
    : null

  const tempProm = wxTomorrow?.temp_prom ?? null
  const tempMin = wxTomorrow?.temp_min ?? null
  const tempMax = wxTomorrow?.temp_max ?? null

  // Stock semaphore: rough rule — if linepack today is below 320 MMm³ AND
  // demand tomorrow is up vs today, flag riesgo. The hard threshold is the
  // approximate LPG MIN band visible in ENARGAS LPG charts (~290-310).
  const stockRisk: 'bajo' | 'medio' | 'alto' = (() => {
    if (linepackToday == null) return 'bajo'
    if (linepackToday < 300) return 'alto'
    if (linepackToday < 325 && (deltaPct ?? 0) > 5) return 'medio'
    return 'bajo'
  })()

  const riskColor = stockRisk === 'alto' ? colors.status.err : stockRisk === 'medio' ? colors.accent.orange : colors.status.ok

  const dateLabel = formatDate(tomorrow)

  return (
    <div style={{
      ...card,
      marginTop: space.lg,
      background: colors.accent.blue + '0a',
      borderLeft: `4px solid ${colors.accent.blue}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.md }}>
        <div>
          <div style={{ color: colors.accent.blue, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Mañana
          </div>
          <div style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginTop: 2 }}>{dateLabel}</div>
        </div>
        <Cell label="Consumo esperado" value={totalEst != null ? `${totalEst.toFixed(0)} MMm³/d` : '—'} delta={deltaPct} />
        <Cell label="Temp BA" value={tempProm != null ? `${tempProm.toFixed(1)}°C` : '—'} sub={tempMin != null && tempMax != null ? `min ${tempMin.toFixed(0)} / max ${tempMax.toFixed(0)}` : undefined} />
        <Cell
          label="Riesgo de stock"
          value={stockRisk.toUpperCase()}
          valueColor={riskColor}
          sub={linepackToday != null ? `LP hoy ${linepackToday.toFixed(0)} MMm³` : undefined}
        />
      </div>
    </div>
  )
}

function Cell({ label, value, sub, delta, valueColor }: { label: string; value: string; sub?: string; delta?: number | null; valueColor?: string }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ color: colors.textDim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: valueColor ?? colors.textPrimary, fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
      {delta != null && (
        <div style={{ color: delta >= 0 ? colors.accent.orange : colors.accent.blue, fontSize: 12, fontWeight: 600, marginTop: 2 }}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs hoy
        </div>
      )}
      {sub && <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function nextISODay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}
