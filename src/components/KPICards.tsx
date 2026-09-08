import type { DailyRow } from '../types'

interface KPI { label: string; value: string; unit: string; color: string }

export default function KPICards({ latest }: { latest?: DailyRow }) {
  if (!latest) return null

  const lpTgsPercent = latest.linepack_tgs && latest.lim_sup_tgs
    ? Math.round((latest.linepack_tgs / latest.lim_sup_tgs) * 100)
    : null
  const lpTgnPercent = latest.linepack_tgn && latest.lim_sup_tgn
    ? Math.round((latest.linepack_tgn / latest.lim_sup_tgn) * 100)
    : null

  const kpis: KPI[] = [
    { label: 'Demanda Total', value: latest.demanda_total?.toFixed(1) ?? '-', unit: 'MMm3/d', color: '#3b82f6' },
    { label: 'Temp. BA', value: latest.temp_prom_ba?.toFixed(0) ?? '-', unit: '°C', color: '#f59e0b' },
    { label: 'Linepack TGS', value: lpTgsPercent != null ? `${lpTgsPercent}` : '-', unit: `% (${latest.linepack_tgs?.toFixed(0) ?? '-'})`, color: '#10b981' },
    { label: 'Linepack TGN', value: lpTgnPercent != null ? `${lpTgnPercent}` : '-', unit: `% (${latest.linepack_tgn?.toFixed(0) ?? '-'})`, color: '#8b5cf6' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
      {kpis.map(k => (
        <div key={k.label} style={{
          background: '#1e293b', borderRadius: 12, padding: '16px 20px',
          border: '1px solid #334155', borderLeft: `4px solid ${k.color}`,
        }}>
          <p style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</p>
          <p style={{ fontSize: 32, fontWeight: 700, color: '#f1f5f9', marginTop: 4 }}>
            {k.value}
            <span style={{ fontSize: 14, fontWeight: 400, color: '#64748b', marginLeft: 6 }}>{k.unit}</span>
          </p>
        </div>
      ))}
    </div>
  )
}
