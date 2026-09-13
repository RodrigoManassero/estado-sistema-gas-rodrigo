import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceArea } from 'recharts'
import type { DailyRow, DemandForecastDay } from '../types'
import { padToDates, formatTooltipDate, weekendSpans } from '../utils/charts'

const fmt = (d: string) => d.slice(5)

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
  // Estado para arrastrar la última observación válida hacia adelante (forward fill)
  let lastKnown = {
    prioritaria: null as number | null,
    industria: null as number | null,
    usinas: null as number | null,
    exportaciones: null as number | null,
  }

  const historical = data.map((d) => {
    // Si la serie existe la usamos y actualizamos el último valor conocido;
    // si viene null/undefined, tomamos la última disponible hacia atrás.
    const prio = d.prioritaria ?? lastKnown.prioritaria
    const ind = d.industria ?? lastKnown.industria
    const usi = d.usinas ?? lastKnown.usinas
    const exp = d.exportaciones ?? lastKnown.exportaciones

    if (d.prioritaria != null) lastKnown.prioritaria = d.prioritaria
    if (d.industria != null) lastKnown.industria = d.industria
    if (d.usinas != null) lastKnown.usinas = d.usinas
    if (d.exportaciones != null) lastKnown.exportaciones = d.exportaciones

    // Si no tenemos ningún dato histórico cerrado previo, las subseries quedan en null
    const hasAnySector = prio != null || ind != null || usi != null || exp != null

    const explicit = (prio ?? 0) + (ind ?? 0) + (usi ?? 0) + (exp ?? 0)

    // Solo se calcula 'otros' si tenemos demanda_total y al menos una subserie histórica válida
    const otros = d.demanda_total != null && hasAnySector
      ? Math.max(0, d.demanda_total - explicit)
      : null

    return {
      fecha: d.fecha,
      prioritaria: hasAnySector ? prio : null,
      industria: hasAnySector ? ind : null,
      usinas: hasAnySector ? usi : null,
      exportaciones: hasAnySector ? exp : null,
      otros,
      prioritaria_est: null as number | null,
      industria_est: null as number | null,
      usinas_est: null as number | null,
      exportaciones_est: null as number | null,
      otros_est: null as number | null,
    }
  })

  const lastHistorical = historical[historical.length - 1]?.fecha ?? ''

  const forecastRows = forecast
    .filter((f) => f.fecha > lastHistorical)
    .map((f) => ({
      fecha: f.fecha,
      prioritaria: null as number | null,
      industria: null as number | null,
      usinas: null as number | null,
      exportaciones: null as number | null,
      otros: null as number | null,
      prioritaria_est: f.prioritaria_est,
      industria_est: f.industria_est ?? null,
      usinas_est: f.usinas_est,
      exportaciones_est: f.exportaciones_est ?? exportacionesBaseline ?? null,
      otros_est: sumNotNull(f.gnc_est, f.combustible_est),
    }))

  const base = [...historical, ...forecastRows]
  const rows = allDates ? padToDates(base, allDates) : base
  const weekends = weekendSpans(rows.map((r) => r.fecha))

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
        {forecastRows.length > 0 && lastHistorical && (
          <ReferenceLine x={lastHistorical} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'Hoy', fill: '#64748b', fontSize: 10 }} />
        )}

        {/* Capa Histórica (relleno sólido) */}
        <Area type="monotone" dataKey="prioritaria" stackId="real" fill={COLORS.prioritaria} stroke={COLORS.prioritaria} name="Prioritaria" isAnimationActive={false} />
        <Area type="monotone" dataKey="industria" stackId="real" fill={COLORS.industria} stroke={COLORS.industria} name="Industria" isAnimationActive={false} />
        <Area type="monotone" dataKey="usinas" stackId="real" fill={COLORS.usinas} stroke={COLORS.usinas} name="Usinas" isAnimationActive={false} />
        <Area type="monotone" dataKey="otros" stackId="real" fill={COLORS.otros} stroke={COLORS.otros} name="GNC + combustible" isAnimationActive={false} />
        <Area type="monotone" dataKey="exportaciones" stackId="real" fill={COLORS.exportaciones} stroke={COLORS.exportaciones} name="Exportaciones" isAnimationActive={false} />

        {/* Capa Forecast (trazo punteado) */}
        <Area type="monotone" dataKey="prioritaria_est" stackId="est" fill={COLORS.prioritaria} fillOpacity={0.15} stroke={COLORS.prioritaria} strokeWidth={1} strokeDasharray="4 3" name="Prioritaria est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="industria_est" stackId="est" fill={COLORS.industria} fillOpacity={0.15} stroke={COLORS.industria} strokeWidth={1} strokeDasharray="4 3" name="Industria est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="usinas_est" stackId="est" fill={COLORS.usinas} fillOpacity={0.15} stroke={COLORS.usinas} strokeWidth={1} strokeDasharray="4 3" name="Usinas est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="otros_est" stackId="est" fill={COLORS.otros} fillOpacity={0.15} stroke={COLORS.otros} strokeWidth={1} strokeDasharray="4 3" name="GNC+Comb est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="exportaciones_est" stackId="est" fill={COLORS.exportaciones} fillOpacity={0.15} stroke={COLORS.exportaciones} strokeWidth={1} strokeDasharray="4 3" name="Exportaciones est." legendType="none" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
