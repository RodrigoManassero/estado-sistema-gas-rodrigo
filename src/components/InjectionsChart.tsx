import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceArea } from 'recharts'
import type { DailyRow } from '../types'
import { padToDates, formatTooltipDate, weekendSpans } from '../utils/charts'

const fmt = (d: string) => d.slice(5)

interface Props {
  data: DailyRow[]
  allDates?: string[]
}

export default function InjectionsChart({ data, allDates }: Props) {
  const rows = allDates ? padToDates(data, allDates) : data
  const weekends = weekendSpans(rows.map((r) => r.fecha))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={rows} syncId="outlook">
        <defs>
          {/* Patrón de tramado opcional para áreas estimadas */}
          <pattern id="forecastPattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="2" strokeOpacity="0.3" />
          </pattern>
        </defs>

        <XAxis dataKey="fecha" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
        
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={formatTooltipDate}
          formatter={(value: any, name: any, item: any) => {
            if (value === null || value === undefined) return [null, null]
            const isFc = item.payload?.isForecast
            return [`${value} MMM³/d ${isFc ? '(Est.)' : ''}`, name]
          }}
        />
        
        <Legend wrapperStyle={{ fontSize: 12 }} />

        {/* Marcado de fines de semana */}
        {weekends.map(([s, e], i) => (
          <ReferenceArea key={`wk-${i}`} x1={s} x2={e} fill="#64748b" fillOpacity={0.08} strokeOpacity={0} ifOverflow="extendDomain" />
        ))}

        {/* ----------------- SERIES REALES / HISTÓRICAS (SÓLIDAS) ----------------- */}
        <Area
          type="monotone"
          dataKey="iny_tgs_real"
          stackId="real"
          fill="#10b981"
          stroke="#10b981"
          name="TGS"
          fillOpacity={0.85}
          connectNulls={false}
        />
        <Area
          type="monotone"
          dataKey="iny_tgn_real"
          stackId="real"
          fill="#3b82f6"
          stroke="#3b82f6"
          name="TGN"
          fillOpacity={0.85}
          connectNulls={false}
        />
        <Area
          type="monotone"
          dataKey="iny_enarsa_real"
          stackId="real"
          fill="#f59e0b"
          stroke="#f59e0b"
          name="ENARSA/GPM"
          fillOpacity={0.85}
          connectNulls={false}
        />
        <Area
          type="monotone"
          dataKey="iny_bolivia_real"
          stackId="real"
          fill="#ef4444"
          stroke="#ef4444"
          name="Bolivia"
          fillOpacity={0.85}
          connectNulls={false}
        />
        <Area
          type="monotone"
          dataKey="iny_escobar_real"
          stackId="real"
          fill="#6b7280"
          stroke="#6b7280"
          name="Escobar"
          fillOpacity={0.85}
          connectNulls={false}
        />

        {/* ----------------- SERIES ESTIMADAS / PROYECTADAS (PUNTEADAS) ----------------- */}
        <Area
          type="monotone"
          dataKey="iny_tgs_est"
          stackId="est"
          fill="#10b981"
          stroke="#10b981"
          strokeDasharray="4 4"
          name="TGS (Est.)"
          fillOpacity={0.35}
          connectNulls={false}
        />
        <Area
          type="monotone"
          dataKey="iny_tgn_est"
          stackId="est"
          fill="#3b82f6"
          stroke="#3b82f6"
          strokeDasharray="4 4"
          name="TGN (Est.)"
          fillOpacity={0.35}
          connectNulls={false}
        />
        <Area
          type="monotone"
          dataKey="iny_enarsa_est"
          stackId="est"
          fill="#f59e0b"
          stroke="#f59e0b"
          strokeDasharray="4 4"
          name="ENARSA/GPM (Est.)"
          fillOpacity={0.35}
          connectNulls={false}
        />
        <Area
          type="monotone"
          dataKey="iny_bolivia_est"
          stackId="est"
          fill="#ef4444"
          stroke="#ef4444"
          strokeDasharray="4 4"
          name="Bolivia (Est.)"
          fillOpacity={0.35}
          connectNulls={false}
        />
        <Area
          type="monotone"
          dataKey="iny_escobar_est"
          stackId="est"
          fill="#6b7280"
          stroke="#6b7280"
          strokeDasharray="4 4"
          name="Escobar (Est.)"
          fillOpacity={0.35}
          connectNulls={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
