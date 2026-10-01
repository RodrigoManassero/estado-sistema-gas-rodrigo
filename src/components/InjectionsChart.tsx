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

export default function InjectionsChart({ data }: Props) {
  const rows = data || []
  const weekends = weekendSpans(rows.map((r) => r.fecha))

  // Obtenemos la fecha de hoy para trazar la línea vertical
  const todayStr = new Date().toISOString().split('T')[0]

  // Procesa las filas para duplicar el punto de empalme entre histórico y forecast
  const chartData = useMemo(() => {
    if (!rows || rows.length === 0) return []

    return rows.map((r, idx) => {
      const isFc = Boolean(r.isForecast)
      const nextIsFc = idx < rows.length - 1 ? Boolean(rows[idx + 1].isForecast) : isFc
      const prevIsFc = idx > 0 ? Boolean(rows[idx - 1].isForecast) : isFc

      // Es punto de frontera si pasa de histórico a forecast o viceversa
      const isBoundary = (!isFc && nextIsFc) || (isFc && !prevIsFc)

      return {
        ...r,
        // Serie Histórica (Sólida)
        iny_tgs_hist: !isFc || isBoundary ? r.iny_tgs ?? 0 : null,
        iny_tgn_hist: !isFc || isBoundary ? r.iny_tgn ?? 0 : null,
        iny_enarsa_hist: !isFc || isBoundary ? r.iny_enarsa ?? 0 : null,
        iny_bolivia_hist: !isFc || isBoundary ? r.iny_bolivia ?? 0 : null,
        iny_escobar_hist: !isFc || isBoundary ? r.iny_escobar ?? 0 : null,

        // Serie Forecast (Tenue y punteada)
        iny_tgs_fc: isFc || isBoundary ? r.iny_tgs ?? 0 : null,
        iny_tgn_fc: isFc || isBoundary ? r.iny_tgn ?? 0 : null,
        iny_enarsa_fc: isFc || isBoundary ? r.iny_enarsa ?? 0 : null,
        iny_bolivia_fc: isFc || isBoundary ? r.iny_bolivia ?? 0 : null,
        iny_escobar_fc: isFc || isBoundary ? r.iny_escobar ?? 0 : null,
      }
    })
  }, [rows])

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData} syncId="outlook">
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
          labelFormatter={formatTooltipDate}
          formatter={(value: any, name: any, item: any) => {
            if (value === null || value === undefined) return [null, null]
            const cleanName = String(name).replace(' (Fc)', '')
            const isFc = item.payload?.isForecast
            return [
              `${Number(value).toFixed(1)} MMM³/d ${isFc ? '(Est.)' : ''}`,
              cleanName,
            ]
          }}
        />

        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value: string) => value.replace(' (Fc)', '')}
        />

        {/* Marcadores de fines de semana */}
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

        {/* Línea vertical de Hoy si cae dentro del rango */}
        {rows.some((r) => r.fecha === todayStr) && (
          <ReferenceLine
            x={todayStr}
            stroke="#94a3b8"
            strokeDasharray="3 3"
            label={{
              value: 'Hoy',
              position: 'center',
              fill: '#64748b',
              fontSize: 10,
            }}
          />
        )}

        {/* --- HISTÓRICO: Opacidad completa (0.85) y contorno sólido --- */}
        <Area
          type="monotone"
          dataKey="iny_tgs_hist"
          stackId="hist"
          fill="#10b981"
          stroke="#10b981"
          name="TGS"
          fillOpacity={0.85}
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="iny_tgn_hist"
          stackId="hist"
          fill="#3b82f6"
          stroke="#3b82f6"
          name="TGN"
          fillOpacity={0.85}
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="iny_enarsa_hist"
          stackId="hist"
          fill="#f59e0b"
          stroke="#f59e0b"
          name="ENARSA/GPM"
          fillOpacity={0.85}
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="iny_bolivia_hist"
          stackId="hist"
          fill="#ef4444"
          stroke="#ef4444"
          name="Bolivia"
          fillOpacity={0.85}
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="iny_escobar_hist"
          stackId="hist"
          fill="#6b7280"
          stroke="#6b7280"
          name="Escobar"
          fillOpacity={0.85}
          strokeWidth={1.5}
        />

        {/* --- FORECAST: Opacidad tenue (0.3) y contorno punteado --- */}
        <Area
          type="monotone"
          dataKey="iny_tgs_fc"
          stackId="fc"
          fill="#10b981"
          stroke="#10b981"
          name="TGS (Fc)"
          fillOpacity={0.3}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          legendType="none"
        />
        <Area
          type="monotone"
          dataKey="iny_tgn_fc"
          stackId="fc"
          fill="#3b82f6"
          stroke="#3b82f6"
          name="TGN (Fc)"
          fillOpacity={0.3}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          legendType="none"
        />
        <Area
          type="monotone"
          dataKey="iny_enarsa_fc"
          stackId="fc"
          fill="#f59e0b"
          stroke="#f59e0b"
          name="ENARSA/GPM (Fc)"
          fillOpacity={0.3}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          legendType="none"
        />
        <Area
          type="monotone"
          dataKey="iny_bolivia_fc"
          stackId="fc"
          fill="#ef4444"
          stroke="#ef4444"
          name="Bolivia (Fc)"
          fillOpacity={0.3}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          legendType="none"
        />
        <Area
          type="monotone"
          dataKey="iny_escobar_fc"
          stackId="fc"
          fill="#6b7280"
          stroke="#6b7280"
          name="Escobar (Fc)"
          fillOpacity={0.3}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          legendType="none"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
