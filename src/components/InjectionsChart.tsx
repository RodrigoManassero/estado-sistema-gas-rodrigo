import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
  ReferenceLine,
} from 'recharts'
import type { DailyRow } from '../types'
import { formatTooltipDate, weekendSpans } from '../utils/charts'

const fmt = (d: string) => d.slice(5)

interface Props {
  data: DailyRow[]
  allDates?: string[]
}

export default function InjectionsChart({ data, allDates }: Props) {
  const rawRows = data || []

  // Filtramos los datos recibidos según el rango de fechas activas (visibleDates de OperacionPage)
  const rows = useMemo(() => {
    if (!allDates || allDates.length === 0) return rawRows
    const set = new Set(allDates)
    return rawRows.filter((r) => set.has(r.fecha))
  }, [rawRows, allDates])

  const weekends = weekendSpans(rows.map((r) => r.fecha))

  // Detectamos el primer día que sea forecast para trazar la línea divisoria
  const firstForecastRow = rows.find((r) => r.isForecast)
  const forecastStartDate = firstForecastRow?.fecha

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={rows} syncId="outlook">
        <XAxis
          dataKey="fecha"
          tickFormatter={fmt}
          tick={{ fill: '#64748b', fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />

        <Tooltip
          contentStyle={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
          }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={(label: any, payload: any[]) => {
            const dateStr = formatTooltipDate(label)
            const isFc = payload && payload[0]?.payload?.isForecast
            return isFc ? `${dateStr} (Estimado)` : dateStr
          }}
          formatter={(value: any, name: any) => {
            if (value === null || value === undefined) return [null, null]
            return [`${Number(value).toFixed(1)} MMM³/d`, name]
          }}
        />

        <Legend wrapperStyle={{ fontSize: 12 }} />

        {/* Sombreado de fines de semana */}
        {weekends.map(([s, e], i) => (
          <ReferenceArea
            key={`wk-${i}`}
            x1={s}
            x2={e}
            fill="#64748b"
            fillOpacity={0.08}
            strokeOpacity={0}
            ifOverflow="extendDomain"
          />
        ))}

        {/* Línea divisoria que marca el inicio de la proyección */}
        {forecastStartDate && (
          <ReferenceLine
            x={forecastStartDate}
            stroke="#94a3b8"
            strokeDasharray="3 3"
            label={{
              value: 'Proyección',
              position: 'insideTopLeft',
              fill: '#94a3b8',
              fontSize: 10,
            }}
          />
        )}

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
