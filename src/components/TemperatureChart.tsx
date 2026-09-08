import { useMemo } from 'react'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import type { DailyRow, ForecastDay, RegionCity } from '../types'
import { colors } from '../theme'
import { padToDates, formatTooltipDate, weekendSpans } from '../utils/charts'

const fmt = (d: string) => d.slice(5)

interface Props {
  data: DailyRow[]
  forecast?: ForecastDay[]
  regions?: RegionCity[]
  selectedCityId?: string
  onSelectCity?: (id: string) => void
  allDates?: string[]
}

export default function TemperatureChart({
  data,
  forecast = [],
  regions,
  selectedCityId = 'ba',
  onSelectCity,
  allDates,
}: Props) {
  const city = regions?.find((r) => r.id === selectedCityId)

  const histKey = {
    ba: { min: 'temp_min_ba', max: 'temp_max_ba', prom: 'temp_prom_ba' },
    esquel: { min: 'temp_min_esquel', max: 'temp_max_esquel', prom: 'temp_prom_esquel' },
  }[selectedCityId as 'ba' | 'esquel']

  const { rows, lastHistorical, hasForecast, weekends } = useMemo(() => {
    const lastDate = data[data.length - 1]?.fecha ?? ''

    const byDate = new Map<string, {
      fecha: string
      temp_prom_real?: number | null
      temp_range_real?: [number | null, number | null] | null
      temp_prom_fc?: number | null
      temp_range_fc?: [number | null, number | null] | null
    }>()

    if (histKey) {
      for (const d of data) {
        const min = (d as never)[histKey.min] as number | null
        const max = (d as never)[histKey.max] as number | null
        byDate.set(d.fecha, {
          fecha: d.fecha,
          temp_prom_real: (d as never)[histKey.prom] as number | null,
          temp_range_real: min != null && max != null ? [min, max] : null,
        })
      }
    }

    const fcSource: ForecastDay[] = city?.forecast ?? forecast
    let hasForecast = false
    for (const f of fcSource) {
      if (f.fecha <= lastDate) continue
      hasForecast = true
      const existing = byDate.get(f.fecha) ?? { fecha: f.fecha }
      byDate.set(f.fecha, {
        ...existing,
        temp_prom_fc: f.temp_prom,
        temp_range_fc: f.temp_min != null && f.temp_max != null ? [f.temp_min, f.temp_max] : null,
      })
    }

    const merged = [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const padded = allDates ? padToDates(merged, allDates) : merged
    const weekends = weekendSpans(padded.map((r) => r.fecha))
    return { rows: padded, lastHistorical: lastDate, hasForecast, weekends }
  }, [data, forecast, city, histKey, allDates])

  return (
    <div>
      {regions && regions.length > 0 && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: colors.textMuted, fontSize: 12 }}>Ciudad</label>
          <select
            value={selectedCityId}
            onChange={(e) => onSelectCity?.(e.target.value)}
            style={{
              background: colors.surface,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 12,
            }}
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          {!histKey && (
            <span style={{ color: colors.textDim, fontSize: 11 }}>
              (solo forecast — sin serie histórica local)
            </span>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={rows} syncId="outlook">
          <XAxis dataKey="fecha" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} unit="°" />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8' }}
            labelFormatter={formatTooltipDate}
            formatter={(v: number | number[], name: string) => {
              if (Array.isArray(v)) {
                return [`${v[0]?.toFixed(0)}° – ${v[1]?.toFixed(0)}°`, name]
              }
              return v != null ? [`${v}°C`, name] : ['-', name]
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {weekends.map(([s, e], i) => (
            <ReferenceArea key={`wk-${i}`} x1={s} x2={e} fill="#64748b" fillOpacity={0.08} strokeOpacity={0} ifOverflow="extendDomain" />
          ))}
          {hasForecast && lastHistorical && (
            <ReferenceLine x={lastHistorical} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'Hoy', fill: '#64748b', fontSize: 10 }} />
          )}

          {/* Historical: shaded min–max envelope + line for the average. */}
          <Area
            type="monotone"
            dataKey="temp_range_real"
            name="Real min-max"
            fill="#f59e0b"
            fillOpacity={0.3}
            stroke="none"
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="temp_prom_real"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            name="Prom real"
            connectNulls
            isAnimationActive={false}
          />

          {/* Forecast: same pattern, lighter fill + dashed line. */}
          <Area
            type="monotone"
            dataKey="temp_range_fc"
            name="Forecast min-max"
            fill="#f59e0b"
            fillOpacity={0.15}
            stroke="none"
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="temp_prom_fc"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="Prom forecast"
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
