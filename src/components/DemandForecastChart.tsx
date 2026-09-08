import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceArea } from 'recharts'
import type { DailyRow, DemandForecastDay } from '../types'
import { padToDates, formatTooltipDate, weekendSpans } from '../utils/charts'

const fmt = (d: string) => d.slice(5)

interface Props {
  data: DailyRow[]
  forecast: DemandForecastDay[]
  allDates?: string[]
  yDomain?: [number, number]
}

export default function DemandForecastChart({ data, forecast, allDates, yDomain }: Props) {
  const lastHistorical = data[data.length - 1]?.fecha ?? ''

  const byDate = new Map<string, {
    fecha: string
    prioritaria_real?: number | null
    demanda_real?: number | null
    prioritaria_est?: number | null
    demanda_est?: number | null
  }>()
  for (const d of data) {
    byDate.set(d.fecha, {
      fecha: d.fecha,
      prioritaria_real: d.prioritaria,
      demanda_real: d.demanda_total,
    })
  }
  for (const f of forecast) {
    if (f.fecha <= lastHistorical) continue
    const existing = byDate.get(f.fecha) ?? { fecha: f.fecha }
    byDate.set(f.fecha, {
      ...existing,
      prioritaria_est: f.prioritaria_est,
      demanda_est: f.demanda_total_est,
    })
  }

  const merged = [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const rows = allDates ? padToDates(merged, allDates) : merged
  const weekends = weekendSpans(rows.map((r) => r.fecha))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} syncId="outlook">
        <XAxis dataKey="fecha" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} domain={yDomain ?? ['auto', 'auto']} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={formatTooltipDate}
          formatter={(v: number, name: string) => (v != null ? [`${v.toFixed(1)} MMm3/d`, name] : ['-', name])}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {weekends.map(([s, e], i) => (
          <ReferenceArea key={`wk-${i}`} x1={s} x2={e} fill="#64748b" fillOpacity={0.08} strokeOpacity={0} ifOverflow="extendDomain" />
        ))}
        {lastHistorical && (
          <ReferenceLine x={lastHistorical} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'Hoy', fill: '#64748b', fontSize: 10 }} />
        )}
        <Line type="monotone" dataKey="demanda_real" stroke="#3b82f6" strokeWidth={2} dot={false} name="Demanda total (real)" connectNulls />
        <Line type="monotone" dataKey="prioritaria_real" stroke="#10b981" strokeWidth={2} dot={false} name="Prioritaria (real)" connectNulls />
        <Line type="monotone" dataKey="demanda_est" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Demanda total (est.)" connectNulls />
        <Line type="monotone" dataKey="prioritaria_est" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Prioritaria (est.)" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}
