import { useMemo } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { colors } from '../theme'
import { historicalBand } from '../utils/historical'

interface Props {
  rows: Array<{ fecha?: string } & Record<string, unknown>>
  field: string
  unit?: string
}

export default function HistoricalBandChart({ rows, field, unit = '' }: Props) {
  const { band, hasBand } = useMemo(() => {
    const data = historicalBand(rows as never, field as never)
    const has = data.some((d) => d.min != null && d.max != null)
    const b = data.map((d) => ({
      mmdd: d.mmdd,
      range: d.min != null && d.max != null ? [d.min, d.max] : [null, null],
      avg: d.avg,
      current: d.current,
    }))
    return { band: b, hasBand: has }
  }, [rows, field])

  if (!hasBand) {
    return <p style={{ color: colors.textDim, fontSize: 13 }}>Sin histórico suficiente todavía.</p>
  }

  const monthLabel = (mmdd: string) => (mmdd.endsWith('-01') ? mmdd.slice(0, 2) : '')

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={band}>
        <XAxis dataKey="mmdd" tickFormatter={monthLabel} tick={{ fill: '#64748b', fontSize: 11 }} interval={0} minTickGap={20} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} unit={unit ? ` ${unit}` : ''} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={(mmdd: string) => `Día ${mmdd}`}
          formatter={(v: number | number[], name: string) => {
            if (Array.isArray(v)) {
              return [`${v[0]?.toFixed(1)} – ${v[1]?.toFixed(1)} ${unit}`.trim(), 'Rango histórico']
            }
            return v != null ? [`${v.toFixed(1)} ${unit}`.trim(), name] : ['-', name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="range"
          name="Rango histórico"
          fill={colors.textDim}
          fillOpacity={0.2}
          stroke="none"
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="avg"
          name="Promedio histórico"
          stroke={colors.textMuted}
          strokeWidth={1}
          strokeDasharray="4 4"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="current"
          name="Año actual"
          stroke={colors.accent.blue}
          strokeWidth={2.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
