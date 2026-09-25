import type { DailyRow } from '../types'

interface Props {
  title: string
  color: string
  data: DailyRow[]
  linepackKey: 'linepack_tgs' | 'linepack_tgn' | string
  varKey: string
  limInfKey: string
  limSupKey: string
  estadoKey?: string
  estByDate?: Map<string, number>
}

const s = {
  panel: { background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' } as React.CSSProperties,
  th: { padding: '6px 8px', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' as const, fontWeight: 600, textAlign: 'left' as const, borderBottom: '1px solid #334155' },
  td: { padding: '8px 8px', fontSize: 14, borderBottom: '1px solid #1e293b' } as React.CSSProperties,
  status: (val: number | null, inf: number | null, sup: number | null) => {
    if (val == null || inf == null || sup == null) return { color: '#64748b', label: '-' }
    if (val < inf) return { color: '#ef4444', label: 'BAJO' }
    if (val > sup) return { color: '#f59e0b', label: 'ALTO' }
    return { color: '#10b981', label: 'NORMAL' }
  },
  estadoBadge: (estado: string) => {
    const up = estado.toUpperCase()
    if (up.includes('ALERTA')) return { color: '#f59e0b', label: 'ALERTA' }
    if (up.includes('EMERG') || up.includes('CRÍT') || up.includes('CRIT')) return { color: '#ef4444', label: up }
    return { color: '#10b981', label: 'NORMAL' }
  },
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T12:00:00')
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  return `${days[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}`
}

export default function SystemPanel({ title, color, data, linepackKey, varKey, limInfKey, limSupKey, estadoKey, estByDate }: Props) {
  // 1. Filtrar registros que tengan dato real en el JSON
  const rowsWithRealData = data.filter(
    d => (d as any)[linepackKey] != null || (d as any).linepack_tgs_dia_actual != null
  )

  // 2. Determinar dinámicamente la última fecha real disponible
  const maxRealDate = rowsWithRealData.length > 0
    ? rowsWithRealData.reduce((max, d) => (d.fecha > max ? d.fecha : max), rowsWithRealData[0].fecha)
    : new Date().toISOString().slice(0, 10)

  // 3. Filtrar los datos hasta esa fecha máxima real
  const validData = data.filter(d => d.fecha && d.fecha <= maxRealDate)

  const byDate = new Map<string, any>()
  for (const d of validData) if (d.fecha) byDate.set(d.fecha, d)

  const realDates = validData.map(d => d.fecha)
  const estDates = [...(estByDate?.keys() ?? [])].filter(f => f <= maxRealDate)

  // Tomar los últimos 6 días con datos reales/válidos
  const last6 = [...new Set([...realDates, ...estDates])].sort().slice(-6)

  // Obtener límites del último registro real
  const lastRealRow = [...validData].reverse().find(d => (d as any)[limInfKey] != null || (d as any).lim_inf_tgs != null)
  const limInf = ((lastRealRow as any)?.[limInfKey] ?? (lastRealRow as any)?.lim_inf_tgs ?? 215) as number | null
  const limSup = ((lastRealRow as any)?.[limSupKey] ?? (lastRealRow as any)?.lim_sup_tgs ?? 235) as number | null

  return (
    <div style={{ ...s.panel, borderTop: `3px solid ${color}` }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>{title}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={s.th}>Día</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Linepack</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Var</th>
            <th style={{ ...s.th, textAlign: 'center' }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {last6.map((fecha, i) => {
            const row = byDate.get(fecha) ?? {}
            
            const real = (row[linepackKey] ?? row.linepack_tgs_dia_actual ?? null) as number | null
            const est = estByDate?.get(fecha) ?? null
            const val = real ?? est
            const isEst = real == null && est != null

            const varVal = (row[varKey] ?? row.linepack_tgs_variacion ?? null) as number | null
            const estadoVal = (estadoKey ? row[estadoKey] : (row.estado ?? null)) as string | null

            const st = isEst ? null : (estadoVal ? s.estadoBadge(estadoVal) : s.status(val, limInf, limSup))
            const isLast = i === last6.length - 1

            return (
              <tr key={fecha} style={{ background: isLast ? '#0f172a' : 'transparent' }}>
                <td style={{ ...s.td, color: '#e2e8f0', fontWeight: isLast ? 700 : 400 }}>
                  {fmtDate(fecha)}
                </td>
                <td style={{ ...s.td, textAlign: 'right', color: isEst ? '#94a3b8' : '#f1f5f9', fontWeight: 600, fontSize: 16 }}>
                  {val != null ? val.toFixed(1) : '-'}
                  {isEst && <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginLeft: 4 }}>est.</span>}
                </td>
                <td style={{ ...s.td, textAlign: 'right', color: varVal != null ? (varVal >= 0 ? '#10b981' : '#ef4444') : '#64748b' }}>
                  {varVal != null ? `${varVal >= 0 ? '+' : ''}${varVal.toFixed(1)}` : '-'}
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  {st ? (
                    <span style={{ background: st.color + '22', color: st.color, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                      {st.label}
                    </span>
                  ) : (
                    <span style={{ color: '#64748b', fontSize: 11 }}>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
        <span>Lím. Inf: <b style={{ color: '#ef4444' }}>{limInf ?? '-'}</b></span>
        <span>Lím. Sup: <b style={{ color: '#10b981' }}>{limSup ?? '-'}</b></span>
      </div>
    </div>
  )
}
