import { colors, sectionTitle, space } from '../theme'
import type { RegionCity } from '../types'

interface Props {
  cities: RegionCity[]
  /** Horizonte en días que consideramos para el ranking (default 7). */
  horizonDays?: number
  topN?: number
}

interface Ranked {
  id: string
  label: string
  coldestTemp: number
  coldestDate: string
  avgMin: number
}

function rankCities(cities: RegionCity[], horizon: number): Ranked[] {
  const ranked = cities
    .map((c) => {
      const horizonDays = c.forecast.slice(0, horizon).filter((d) => d.temp_min != null)
      if (horizonDays.length === 0) return null
      const coldest = horizonDays.reduce((a, b) => ((a.temp_min ?? 999) <= (b.temp_min ?? 999) ? a : b))
      const avgMin = horizonDays.reduce((s, d) => s + (d.temp_min ?? 0), 0) / horizonDays.length
      return {
        id: c.id,
        label: c.label,
        coldestTemp: coldest.temp_min as number,
        coldestDate: coldest.fecha,
        avgMin,
      }
    })
    .filter((x): x is Ranked => x !== null)
  ranked.sort((a, b) => a.coldestTemp - b.coldestTemp)
  return ranked
}

function fmtDate(d: string): string {
  const dt = new Date(d + 'T12:00:00')
  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  return `${days[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}`
}

export default function ColdRanking({ cities, horizonDays = 7, topN = 5 }: Props) {
  const ranked = rankCities(cities, horizonDays).slice(0, topN)
  if (ranked.length === 0) {
    return <p style={{ color: colors.textDim, fontSize: 13 }}>Sin datos de forecast regional.</p>
  }
  return (
    <div>
      <h3 style={sectionTitle}>Ciudades más frías (próximos {horizonDays} días)</h3>
      <p style={{ color: colors.textDim, fontSize: 11, marginBottom: space.sm }}>
        Driver clave para picos de demanda prioritaria
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={th}>Ciudad</th>
            <th style={{ ...th, textAlign: 'right' }}>Min pico</th>
            <th style={{ ...th, textAlign: 'right' }}>Día</th>
            <th style={{ ...th, textAlign: 'right' }}>Avg min</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.id}>
              <td style={{ ...td, color: colors.textDim }}>{i + 1}</td>
              <td style={{ ...td, color: colors.textPrimary, fontWeight: 600 }}>{r.label}</td>
              <td style={{ ...td, textAlign: 'right', color: tempToColor(r.coldestTemp), fontWeight: 700 }}>
                {r.coldestTemp.toFixed(1)}°
              </td>
              <td style={{ ...td, textAlign: 'right', color: colors.textSecondary }}>
                {fmtDate(r.coldestDate)}
              </td>
              <td style={{ ...td, textAlign: 'right', color: colors.textMuted }}>{r.avgMin.toFixed(1)}°</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function tempToColor(temp: number): string {
  if (temp <= 0) return '#1e3a8a'
  if (temp <= 5) return '#2563eb'
  if (temp <= 10) return '#0891b2'
  return '#10b981'
}

const th: React.CSSProperties = {
  padding: '6px 8px',
  color: colors.textMuted,
  fontSize: 11,
  textTransform: 'uppercase',
  fontWeight: 600,
  textAlign: 'left',
  borderBottom: `1px solid ${colors.border}`,
}

const td: React.CSSProperties = {
  padding: '8px',
  borderBottom: `1px solid ${colors.surface}`,
}
