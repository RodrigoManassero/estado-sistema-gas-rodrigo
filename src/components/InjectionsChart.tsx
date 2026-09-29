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
          {/* Patrón de tramado para dar textura opcional a zonas estimadas */}
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
            const isFc = item.payload?.isForecast
            return [`${value} MMM³/d ${isFc ? '(Est.)' : ''}`, name]
          }}
        />
        
        <Legend wrapperStyle={{ fontSize: 12 }} />

        {/* Marcado de fines de semana */}
        {weekends.map(([s, e], i) => (
          <ReferenceArea key={`wk-${i}`} x1={s} x2={e} fill="#64748b" fillOpacity={0.08} strokeOpacity={0} ifOverflow="extendDomain" />
        ))}

        {/* Capas apiladas de Inyecciones por Cuenca / Gasoducto */}
        <Area
          type="monotone"
          dataKey="iny_tgs"
          stackId="1"
          fill="#10b981"
          stroke="#10b981"
          name="TGS"
          fillOpacity={0.85}
        />
        <Area
          type="monotone"
          dataKey="iny_tgn"
          stackId="1"
          fill="#3b82f6"
          stroke="#3b82f6"
          name="TGN"
          fillOpacity={0.85}
        />
        <Area
          type="monotone"
          dataKey="iny_enarsa"
          stackId="1"
          fill="#f59e0b"
          stroke="#f59e0b"
          name="ENARSA/GPM"
          fillOpacity={0.85}
        />
        <Area
          type="monotone"
          dataKey="iny_bolivia"
          stackId="1"
          fill="#ef4444"
          stroke="#ef4444"
          name="Bolivia"
          fillOpacity={0.85}
        />
        <Area
          type="monotone"
          dataKey="iny_escobar"
          stackId="1"
          fill="#6b7280"
          stroke="#6b7280"
          name="Escobar"
          fillOpacity={0.85}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
