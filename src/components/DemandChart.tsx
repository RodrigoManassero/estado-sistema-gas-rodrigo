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

  // Mapa auxiliar para acceder rápidamente a las filas del forecast por fecha
  const forecastMap = new Map(forecast.map((f) => [f.fecha, f]))

  // 2. Unificar historial y proyección con punto de solapamiento en lastHistorical
  const combinedRows = data.map((d) => {
    const isHistorical = !lastHistorical || d.fecha <= lastHistorical
    const isOverlap = d.fecha === lastHistorical

    // Valores históricos
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

    // Valores estimados: se asignan si la fecha es posterior a lastHistorical
    // o si es exactamente la fecha de empalme (lastHistorical)
    const f = forecastMap.get(d.fecha)
    const isForecast = !lastHistorical || d.fecha >= lastHistorical

    let prioEst: number | null = null
    let indEst: number | null = null
    let usiEst: number | null = null
    let expEst: number | null = null
    let otrosEst: number | null = null

    if (isForecast) {
      if (isOverlap) {
        // En el empalme usamos los valores reales históricos como punto de partida
        prioEst = prio
        indEst = ind
        usiEst = usi
        expEst = exp
        otrosEst = otros
      } else if (f) {
        prioEst = f.prioritaria_est ?? null
        indEst = f.industria_est ?? null
        usiEst = f.usinas_est ?? null
        expEst = f.exportaciones_est ?? exportacionesBaseline ?? null
        otrosEst = sumNotNull(f.gnc_est, f.combustible_est)
      }
    }

    return {
      fecha: d.fecha,
      prioritaria: prio,
      industria: ind,
      usinas: usi,
      exportaciones: exp,
      otros,
      prioritaria_est: prioEst,
      industria_est: indEst,
      usinas_est: usiEst,
      exportaciones_est: expEst,
      otros_est: otrosEst,
    }
  })

  // Agregar los días futuros de forecast que no estén presentes en data
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

  // Ordenar por fecha
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

        {/* Línea "Hoy" dinámica basada en la fecha del sistema */}
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

        {/* Capa Forecast (translúcida / punteada) */}
        <Area type="monotone" dataKey="prioritaria_est" stackId="est" fill={COLORS.prioritaria} fillOpacity={0.15} stroke={COLORS.prioritaria} strokeWidth={1} strokeDasharray="4 3" name="Prioritaria est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="industria_est" stackId="est" fill={COLORS.industria} fillOpacity={0.15} stroke={COLORS.industria} strokeWidth={1} strokeDasharray="4 3" name="Industria est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="usinas_est" stackId="est" fill={COLORS.usinas} fillOpacity={0.15} stroke={COLORS.usinas} strokeWidth={1} strokeDasharray="4 3" name="Usinas est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="otros_est" stackId="est" fill={COLORS.otros} fillOpacity={0.15} stroke={COLORS.otros} strokeWidth={1} strokeDasharray="4 3" name="GNC+Comb est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="exportaciones_est" stackId="est" fill={COLORS.exportaciones} fillOpacity={0.15} stroke={COLORS.exportaciones} strokeWidth={1} strokeDasharray="4 3" name="Exportaciones est." legendType="none" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
