import type { DailyRow } from '../types'

function avg(arr: (number | null)[]): number | null {
  const valid = arr.filter((v): v is number => v != null)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

export default function WeeklyComparison({ data }: { data: DailyRow[] }) {
  const valid = data.filter(d => d.demanda_total != null)
  if (valid.length < 14) return null

  const thisWeek = valid.slice(-7)
  const lastWeek = valid.slice(-14, -7)

  const metrics = [
    { label: 'Demanda Total', unit: 'MMm3/d', cur: avg(thisWeek.map(d => d.demanda_total)), prev: avg(lastWeek.map(d => d.demanda_total)) },
    { label: 'Prioritaria', unit: 'MMm3/d', cur: avg(thisWeek.map(d => d.prioritaria)), prev: avg(lastWeek.map(d => d.prioritaria)) },
    { label: 'Usinas', unit: 'MMm3/d', cur: avg(thisWeek.map(d => d.usinas)), prev: avg(lastWeek.map(d => d.usinas)) },
    { label: 'Temp. Prom BA', unit: '°C', cur: avg(thisWeek.map(d => d.temp_prom_ba)), prev: avg(lastWeek.map(d => d.temp_prom_ba)) },
    { label: 'Iny. Total', unit: 'MMm3/d', cur: avg(thisWeek.map(d => d.iny_total)), prev: avg(lastWeek.map(d => d.iny_total)) },
  ]

  const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #334155', fontSize: 13 }

  return (
    <div>
      <h3 style={{ marginBottom: 12, color: '#94a3b8', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>
        Comparacion semanal
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...td, color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Métrica</th>
            <th style={{ ...td, color: '#94a3b8', fontSize: 11, textAlign: 'right' }}>Sem N-1</th>
            <th style={{ ...td, color: '#94a3b8', fontSize: 11, textAlign: 'right' }}>Sem N</th>
            <th style={{ ...td, color: '#94a3b8', fontSize: 11, textAlign: 'right' }}>Delta</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(m => {
            const delta = m.cur != null && m.prev != null ? m.cur - m.prev : null
            return (
              <tr key={m.label}>
                <td style={{ ...td, color: '#e2e8f0' }}>{m.label}</td>
                <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{m.prev?.toFixed(1) ?? '-'}</td>
                <td style={{ ...td, textAlign: 'right', color: '#f1f5f9', fontWeight: 600 }}>{m.cur?.toFixed(1) ?? '-'}</td>
                <td style={{ ...td, textAlign: 'right', color: delta != null ? (delta >= 0 ? '#10b981' : '#ef4444') : '#64748b', fontWeight: 600 }}>
                  {delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ${m.unit}` : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
