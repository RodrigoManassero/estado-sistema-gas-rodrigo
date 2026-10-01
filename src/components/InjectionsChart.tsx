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

  // Fecha actual (Hoy) para trazar la referencia vertical
  const todayStr = new Date().toISOString().split('T')[0]

  // Procesa los datos separando en campos _hist y _fc
  const chartData = useMemo(() => {
    if (!rows || rows.length === 0) return []

    return rows.map((r, idx) => {
      const isFc = Boolean(r.isForecast)
      const prevIsFc = idx > 0 ? Boolean(rows[idx - 1].isForecast) : isFc
      const nextIsFc = idx < rows.length - 1 ? Boolean(rows[idx + 1].isForecast) : isFc

      // Puntos de frontera para conectar las áreas
      const isBoundary = (!isFc && nextIsFc) || (isFc && !prevIsFc)

      return {
        ...r,
        // Datos Históricos (se pintan sólidos si !isForecast o en el límite)
        iny_tgs_hist: !isFc || isBoundary ? r.iny_tgs ?? 0 : null,
        iny_tgn_hist: !isFc || isBoundary ? r.iny_tgn ?? 0 : null,
        iny_enarsa_hist: !isFc || isBoundary ? r.iny_enarsa ?? 0 : null,
        iny_bolivia_hist: !isFc || isBoundary ? r.iny_bolivia ?? 0 : null,
        iny_escobar_hist: !isFc || isBoundary ? r.iny_escobar ?? 0 : null,

        // Datos Proyectados / Forecast (se pintan más tenues y punteados)
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
            // Limpia sufijos de la leyenda en el tooltip
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

        {/* Fondeo para fines de semana */}
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

        {/* Línea de referencia de "Hoy" */}
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

        {/* --- ÁREAS HISTÓRICAS (Sólidas y con Opacidad Completa) --- */}
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

        {/* --- ÁREAS PROYECTADAS / FORECAST (Más Tenues y con Bordes Punteados) --- */}
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
