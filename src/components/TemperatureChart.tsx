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
import type { DailyRow, ForecastDay, RegionCity, WeatherHistoryRecord } from '../types'
import { colors } from '../theme'
import {
  padToDates,
  formatTooltipDate,
  weekendSpans,
  getTodayIso,
  getLastDateWithData,
} from '../utils/charts'

const fmt = (d: string) => d.slice(5)

interface Props {
  data: DailyRow[]
  historyData?: WeatherHistoryRecord | WeatherHistoryRecord[] | null
  forecast?: ForecastDay[]
  regions?: RegionCity[]
  selectedCityId?: string
  onSelectCity?: (id: string) => void
  allDates?: string[]
}

export default function TemperatureChart({
  data,
  historyData,
  forecast = [],
  regions,
  selectedCityId = 'ba',
  onSelectCity,
  allDates,
}: Props) {
  const city = regions?.find((r) => r.id === selectedCityId)

  // 1. Intentar obtener la serie histórica desde weather_history.json
  const cityHistoryList = useMemo(() => {
    if (!historyData) return []
    const records = Array.isArray(historyData) ? historyData : [historyData]
    const match = records.find(
      (r) => r.id === selectedCityId || r.region?.toLowerCase() === selectedCityId.toLowerCase()
    )
    return match?.history ?? []
  }, [historyData, selectedCityId])

  // Map rápido fecha -> datos históricos de weather_history.json
  const historyMap = useMemo(() => {
    const map = new Map<string, { temp_prom: number; temp_min: number; temp_max: number }>()
    for (const item of cityHistoryList) {
      map.set(item.fecha, {
        temp_prom: item.temp_prom ?? 0,
        temp_min: item.temp_min ?? 0,
        temp_max: item.temp_max ?? 0,
      })
    }
    return map
  }, [cityHistoryList])

  // Fallback para legacy keys en daily.json
  const legacyHistKey = {
    ba: 'temp_prom_ba',
    esquel: 'temp_prom_esquel',
  }[selectedCityId as 'ba' | 'esquel'] as keyof DailyRow | undefined

  const { rows, hasForecast, weekends, hasHistoricalData } = useMemo(() => {
    const byDate = new Map<string, {
      fecha: string
      temp_prom_real?: number | null
      temp_range_real?: [number | null, number | null] | null
      temp_prom_fc?: number | null
      temp_range_fc?: [number | null, number | null] | null
    }>()

    let hasHistoricalData = false

    // 2. Cargar histórico primario desde weather_history.json
    if (historyMap.size > 0) {
      hasHistoricalData = true
      for (const [fecha, values] of historyMap.entries()) {
        byDate.set(fecha, {
          fecha,
          temp_prom_real: values.temp_prom,
          temp_range_real: [values.temp_min, values.temp_max],
        })
      }
    } else if (legacyHistKey) {
      // Fallback a daily.json
      const minKey = legacyHistKey.replace('prom', 'min') as keyof DailyRow
      const maxKey = legacyHistKey.replace('prom', 'max') as keyof DailyRow
      for (const d of data) {
        const min = (d[minKey] as number | null) ?? 0
        const max = (d[maxKey] as number | null) ?? 0
        const prom = d[legacyHistKey] as number | null
        if (prom != null) {
          hasHistoricalData = true
          byDate.set(d.fecha, {
            fecha: d.fecha,
            temp_prom_real: prom,
            temp_range_real: [min, max],
          })
        }
      }
    }

    // Identificar última fecha con datos reales
    const lastDateWithData = legacyHistKey ? getLastDateWithData(data, legacyHistKey) : ''

    // 3. Empalmar Forecast sin dejar brechas
    const fcSource: ForecastDay[] = city?.forecast ?? forecast
    let hasForecast = false
    for (const f of fcSource) {
      const existing = byDate.get(f.fecha)
      if (f.fecha > lastDateWithData || !existing?.temp_prom_real) {
        hasForecast = true
        byDate.set(f.fecha, {
          ...(existing ?? { fecha: f.fecha }),
          temp_prom_fc: f.temp_prom ?? 0,
          temp_range_fc: [f.temp_min ?? 0, f.temp_max ?? 0],
        })
      }
    }

    const merged = [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const padded = allDates ? padToDates(merged, allDates) : merged
    const weekends = weekendSpans(padded.map((r) => r.fecha))

    return { rows: padded, hasForecast, weekends, hasHistoricalData }
  }, [data, historyMap, legacyHistKey, forecast, city, allDates])

  const todayIso = getTodayIso()

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
          {!hasHistoricalData && (
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
          
          {/* Línea "Hoy" dinámica basada en la fecha del reloj */}
          {hasForecast && (
            <ReferenceLine
              x={todayIso}
              stroke="#64748b"
              strokeDasharray="3 3"
              label={{ value: 'Hoy', fill: '#64748b', fontSize: 10 }}
            />
          )}

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
