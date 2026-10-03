import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceArea } from 'recharts'
import type { DailyRow, DemandForecastDay } from '../types'
import {
  padToDates,
  formatTooltipDate,
  weekendSpans,
  getTodayIso,
} from '../utils/charts'

const fmt = (d: string) => (d && d.length >= 10 ? d.slice(5, 10) : d)

interface Props {
  data: DailyRow[]
  forecast?: DemandForecastDay[]
  exportacionesBaseline?: number
  allDates?: string[]
  yDomain?: [number, number]
}

const COLORS = {
  prioritaria: '#3b82f6',
  industria: '#10b981',
  usinas: '#f59e0b',
  exportaciones: '#8b5cf6',
  otros: '#94a3b8',
}

function sumNotNull(...vals: (number | null | undefined)[]): number | null {
  let total = 0
  let hasAny = false
  for (const v of vals) {
    if (typeof v === 'number') {
      total += v
      hasAny = true
    }
  }
  return hasAny ? total : null
}

export default function DemandChart({
  data,
  forecast = [],
  exportacionesBaseline,
  allDates,
  yDomain,
}: Props) {
  // 1. Encontrar la última fecha que tiene la información HISTÓRICA COMPLETA
  let lastHistorical = ''
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].prioritaria != null && data[i].industria != null) {
      lastHistorical = data[i].fecha
      break
    }
  }

  const forecastMap = new Map(forecast.map((f) => [f.fecha, f]))

  // 2. Mapear datos reales
  const combinedRows = data.map((d) => {
    const isHistorical = !lastHistorical || d.fecha <= lastHistorical

    const prio = isHistorical ? d.prioritaria ?? null : null
    const ind = isHistorical ? d.industria ?? null : null
    const usi = isHistorical ? d.usinas ?? null : null
    const exp = isHistorical ? d.exportaciones ?? null : null

    const hasAnySector = prio != null || ind != null || usi != null || exp != null
    const explicit = (prio ?? 0) + (ind ?? 0) + (usi ?? 0) + (exp ?? 0)

    const otros =
      isHistorical && d.demanda_total != null && hasAnySector
        ? Math.max(0, d.demanda_total - explicit)
        : null

    const f = forecastMap.get(d.fecha)
    // Para la fecha de unificación (lastHistorical) asignamos null a los _est.
    // connectNulls={true} conectará la curva desde la primera fecha estimada sin duplicar el Tooltip.
    const isForecastStrict = !lastHistorical || d.fecha > lastHistorical

    return {
      fecha: d.fecha,
      prioritaria: prio,
      industria: ind,
      usinas: usi,
      exportaciones: exp,
      otros,
      prioritaria_est: isForecastStrict && f ? f.prioritaria_est ?? null : null,
      industria_est: isForecastStrict && f ? f.industria_est ?? null : null,
      usinas_est: isForecastStrict && f ? f.usinas_est ?? null : null,
      exportaciones_est: isForecastStrict && f ? f.exportaciones_est ?? exportacionesBaseline ?? null : null,
      otros_est: isForecastStrict && f ? sumNotNull(f.gnc_est, f.combustible_est) : null,
    }
  })

  // 3. Agregar fechas futuras que solo existan en el forecast
  forecast.forEach((f) => {
    if (!combinedRows.some((r) => r.fecha === f.fecha)) {
      combinedRows.push({
        fecha: f.fecha,
        prioritaria: null,
        industria: null,
        usinas: null,
        exportaciones: null,
        otros: null,
        prioritaria_est: f.prioritaria_est ?? null,
        industria_est: f.industria_est ?? null,
        usinas_est: f.usinas_est ?? null,
        exportaciones_est: f.exportaciones_est ?? exportacionesBaseline ?? null,
        otros_est: sumNotNull(f.gnc_est, f.combustible_est),
      })
    }
  })

  combinedRows.sort((a, b) => a.fecha.localeCompare(b.fecha))

  const rows = allDates ? padToDates(combinedRows, allDates) : combinedRows
  const weekends = weekendSpans(rows.map((r) => r.fecha))
  const todayIso = getTodayIso()

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={rows} syncId="outlook">
        <XAxis dataKey="fecha" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} domain={yDomain ?? ['auto', 'auto']} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={formatTooltipDate}
          formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {weekends.map(([s, e], i) => (
          <ReferenceArea key={`wk-${i}`} x1={s} x2={e} fill="#64748b" fillOpacity={0.08} strokeOpacity={0} ifOverflow="extendDomain" />
        ))}

        <ReferenceLine
          x={todayIso}
          stroke="#64748b"
          strokeDasharray="3 3"
          label={{ value: 'Hoy', fill: '#64748b', fontSize: 10 }}
        />

        {/* Capa Histórica (sólida) */}
        <Area type="monotone" dataKey="prioritaria" stackId="real" fill={COLORS.prioritaria} stroke={COLORS.prioritaria} name="Prioritaria" isAnimationActive={false} />
        <Area type="monotone" dataKey="industria" stackId="real" fill={COLORS.industria} stroke={COLORS.industria} name="Industria" isAnimationActive={false} />
        <Area type="monotone" dataKey="usinas" stackId="real" fill={COLORS.usinas} stroke={COLORS.usinas} name="Usinas" isAnimationActive={false} />
        <Area type="monotone" dataKey="otros" stackId="real" fill={COLORS.otros} stroke={COLORS.otros} name="GNC + combustible" isAnimationActive={false} />
        <Area type="monotone" dataKey="exportaciones" stackId="real" fill={COLORS.exportaciones} stroke={COLORS.exportaciones} name="Exportaciones" isAnimationActive={false} />

        {/* Capa Forecast (translúcida / punteada) con connectNulls={true} */}
        <Area type="monotone" dataKey="prioritaria_est" stackId="est" fill={COLORS.prioritaria} fillOpacity={0.15} stroke={COLORS.prioritaria} strokeWidth={1} strokeDasharray="4 3" name="Prioritaria est." legendType="none" isAnimationActive={false} connectNulls={true} />
        <Area type="monotone" dataKey="industria_est" stackId="est" fill={COLORS.industria} fillOpacity={0.15} stroke={COLORS.industria} strokeWidth={1} strokeDasharray="4 3" name="Industria est." legendType="none" isAnimationActive={false} connectNulls={true} />
        <Area type="monotone" dataKey="usinas_est" stackId="est" fill={COLORS.usinas} fillOpacity={0.15} stroke={COLORS.usinas} strokeWidth={1} strokeDasharray="4 3" name="Usinas est." legendType="none" isAnimationActive={false} connectNulls={true} />
        <Area type="monotone" dataKey="otros_est" stackId="est" fill={COLORS.otros} fillOpacity={0.15} stroke={COLORS.otros} strokeWidth={1} strokeDasharray="4 3" name="GNC+Comb est." legendType="none" isAnimationActive={false} connectNulls={true} />
        <Area type="monotone" dataKey="exportaciones_est" stackId="est" fill={COLORS.exportaciones} fillOpacity={0.15} stroke={COLORS.exportaciones} strokeWidth={1} strokeDasharray="4 3" name="Exportaciones est." legendType="none" isAnimationActive={false} connectNulls={true} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
