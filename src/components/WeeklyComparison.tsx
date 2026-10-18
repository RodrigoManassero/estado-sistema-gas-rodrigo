import type { DailyRow } from '../types'

function avg(arr: (number | null)[]): number | null {
  const valid = arr.filter((v): v is number => v != null && v > 0)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

export default function WeeklyComparison({ data }: { data: DailyRow[] }) {
  if (!data || data.length === 0) return null

  // 1. Tomar la fecha de hoy o usar el último registro disponible como referencia "hoy" si no estamos en entorno con fecha del sistema
  // Ordenamos cronológicamente por la propiedad "fecha"
  const sortedData = [...data].sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())

  // Filtrar solo filas con demanda válida
  const validRows = sortedData.filter((d: any) => d.demanda_total != null && d.demanda_total > 0)
  if (validRows.length === 0) return null

  // 2. Definir "ayer" basado en el último registro disponible o en la fecha actual real
  // Usamos el penúltimo elemento si el último es el día de hoy en curso, o filtramos estrictamente por fecha < "hoy"
  const todayStr = new Date().toISOString().split('T')[0] // '2026-10-18' (o la fecha actual)
  
  // Filtramos para ignorar cualquier dato que sea igual o mayor al día de hoy (descartando fechas futuras o el día corriente incompleto)
  const pastRows = validRows.filter((d: any) => d.fecha < todayStr)

  if (pastRows.length < 14) return null

  // 3. Tomar exactamente los 7 días anteriores a ayer para Semana N, y los 7 anteriores para Semana N-1
  const thisWeek = pastRows.slice(-7)
  const lastWeek = pastRows.slice(-14, -7)

  const metrics = [
    { label: 'Demanda Total', unit: 'MMm3/d', cur: avg(thisWeek.map((d: any) => d.demanda_total)), prev: avg(lastWeek.map((d: any) => d.demanda_total)) },
    { label: 'Prioritaria', unit: 'MMm3/d', cur: avg(thisWeek.map((d: any) => d.prioritaria)), prev: avg(lastWeek.map((d: any) => d.prioritaria)) },
    { label: 'Usinas', unit: 'MMm3/d', cur: avg(thisWeek.map((d: any) => d.usinas)), prev: avg(lastWeek.map((d: any) => d.usinas)) },
    { label: 'Temp. Prom BA', unit: '°C', cur: avg(thisWeek.map((d: any) => d.temp_prom_ba)), prev: avg(lastWeek.map((d: any) => d.temp_prom_ba)) },
    { label: 'Iny. Total', unit: 'MMm3/d', cur: avg(thisWeek.map((d: any) => d.iny_total)), prev: avg(lastWeek.map((d: any) => d.iny_total)) },
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
