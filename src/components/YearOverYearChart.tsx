import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { colors } from '../theme'
import { byYear } from '../utils/historical'

interface Props {
  rows: Array<{ fecha?: string } & Record<string, unknown>>
  /** Numeric field to plot (e.g. "linepack_total", "consumo_total_estimado"). */
  field: string
  unit?: string
  /** Pinned colors per year (default = rotation over accent palette). */
  yearColors?: Record<string, string>
}

const DEFAULT_YEAR_COLORS = [
  colors.textDim,
  colors.accent.purple,
  colors.accent.orange,
  colors.accent.blue,
  colors.accent.green,
]

function monthLabel(mmdd: string): string {
  // Only label month starts to keep the X axis readable.
  return mmdd.endsWith('-01') ? mmdd.slice(0, 2) : ''
}

export default function YearOverYearChart({ rows, field, unit = '', yearColors }: Props) {
  const { rows: yoy, years } = useMemo(
    () => byYear(rows as never, field as never),
    [rows, field],
  )
  if (years.length === 0) {
    return <p style={{ color: colors.textDim, fontSize: 13 }}>Sin datos históricos todavía.</p>
  }
  const colorFor = (year: string, i: number) =>
    yearColors?.[year] ?? DEFAULT_YEAR_COLORS[i % DEFAULT_YEAR_COLORS.length]

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={yoy}
        /* animation off — redrawing 365 points × N years stutters otherwise. */
      >
        <XAxis dataKey="mmdd" tickFormatter={monthLabel} tick={{ fill: '#64748b', fontSize: 11 }} interval={0} minTickGap={20} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} unit={unit ? ` ${unit}` : ''} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={(mmdd: string) => `Día ${mmdd}`}
          formatter={(v: number, year: string) => (v != null ? [`${v.toFixed(1)} ${unit}`.trim(), year] : ['-', year])}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {years.map((year, i) => {
          const isCurrent = i === years.length - 1
          return (
            <Line
              key={year}
              type="monotone"
              dataKey={year}
              stroke={colorFor(year, i)}
              strokeWidth={isCurrent ? 2.5 : 1.2}
              strokeOpacity={isCurrent ? 1 : 0.7}
              dot={false}
              name={year}
              connectNulls
              isAnimationActive={false}
            />
          )
        })}
      </LineChart>
    </ResponsiveContainer>
  )
}
