import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
  ReferenceLine,
} from 'recharts'
import type { DailyRow, DemandForecastDay } from '../types'
import type { CammesaPPORow } from '../hooks/useData'
import { padToDates, formatTooltipDate, weekendSpans } from '../utils/charts'

const fmt = (d: string) => d.slice(5)

interface Props {
  data: DailyRow[]
  /** CAMMESA PPO (dato cerrado); overlaid as a ground-truth line. */
  ppoRows?: CammesaPPORow[]
  /** Forecast de demanda: usinas_est es el gas de usinas proyectado (14d) que
   *  usamos como gas estimado del despacho, más allá de la Previsión semanal. */
  demandForecast?: DemandForecastDay[]
  allDates?: string[]
}

const GAS = '#3b82f6'
const GASOIL = '#f59e0b'
const FUELOIL = '#ef4444'
const CARBON = '#6b7280'
const PPO_LINE = '#e2e8f0'

export default function FuelMixChart({ data, ppoRows = [], demandForecast = [], allDates }: Props) {
  // Mapa de gas cerrado PPO por fecha
  const ppoByDate = new Map<string, number>()
  for (const r of ppoRows) {
    if (r.fecha && typeof r.gas_mmm3 === 'number') ppoByDate.set(r.fecha, r.gas_mmm3)
  }

  // Identificar la última fecha histórica con dato cerrado
  const historicalOnly = data.filter((d) => d.cammesa_gas != null)
  const lastHistorical = historicalOnly[historicalOnly.length - 1]?.fecha ?? ''

  // Forecast de demanda (usinas_est) posterior al cierre real
  const usinasByDate = new Map<string, number>()
  for (const f of demandForecast) {
    if (f.fecha > lastHistorical && f.usinas_est != null) {
      usinasByDate.set(f.fecha, f.usinas_est)
    }
  }

  // Re-nivelación del forecast de usinas según el desvío reciente vs CAMMESA
  const gasBiasSamples = data
    .filter((d) => d.usinas != null && d.cammesa_gas != null)
    .slice(-14)
    .map((d) => (d.cammesa_gas as number) - (d.usinas as number))
  const gasBias =
    gasBiasSamples.length >= 5
      ? gasBiasSamples.reduce((a, b) => a + b, 0) / gasBiasSamples.length
      : 0

  const dailyByDate = new Map(data.map((d) => [d.fecha, d]))

  // Consolidación de todas las fechas sin duplicaciones
  const allDatesSet = new Set<string>([
    ...data.map((d) => d.fecha),
    ...ppoRows.map((r) => r.fecha).filter(Boolean),
    ...usinasByDate.keys(),
  ])

  const merged = Array.from(allDatesSet)
    .sort((a, b) => a.localeCompare(b))
    .map((fecha) => {
      const d = dailyByDate.get(fecha)
      const u = usinasByDate.get(fecha)
      const ppoVal = ppoByDate.get(fecha) ?? null

      // Evaluamos si la fecha pertenece al período cerrado
      const isClosed = fecha <= lastHistorical && (d?.cammesa_gas != null || ppoVal != null)

      if (isClosed) {
        return {
          fecha,
          cammesa_gas: d?.cammesa_gas ?? null,
          cammesa_gasoil: d?.cammesa_gasoil ?? null,
          cammesa_fueloil: d?.cammesa_fueloil ?? null,
          cammesa_carbon: d?.cammesa_carbon ?? null,
          ppo_gas: ppoVal,
          // Nulos explícitos para no superponer proyectado sobre real
          cammesa_gas_est: null,
          cammesa_gasoil_est: null,
          cammesa_fueloil_est: null,
          cammesa_carbon_est: null,
        }
      } else {
        return {
          fecha,
          // Nulos explícitos para no pintar barras reales en la ventana futura
          cammesa_gas: null,
          cammesa_gasoil: null,
          cammesa_fueloil: null,
          cammesa_carbon: null,
          ppo_gas: null,
          cammesa_gas_est: d?.cammesa_gas_est ?? (u != null ? u + gasBias : null),
          cammesa_gasoil_est: d?.cammesa_gasoil_est ?? null,
          cammesa_fueloil_est: d?.cammesa_fueloil_est ?? null,
          cammesa_carbon_est: d?.cammesa_carbon_est ?? null,
        }
      }
    })

  const rows = allDates ? padToDates(merged, allDates) : merged
  const weekends = weekendSpans(rows.map((r) => r.fecha))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} syncId="outlook">
        <XAxis
          dataKey="fecha"
          tickFormatter={fmt}
          tick={{ fill: '#64748b', fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={formatTooltipDate}
          formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
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
        {lastHistorical && (
          <ReferenceLine
            x={lastHistorical}
            stroke="#64748b"
            strokeDasharray="3 3"
            label={{ value: 'Hoy', fill: '#64748b', fontSize: 10 }}
          />
        )}
        {/* Cerrado: mezcla real apilada en MMm³ gas-equivalente. */}
        <Bar dataKey="cammesa_gas" stackId="real" fill={GAS} name="Gas" isAnimationActive={false} />
        <Bar dataKey="cammesa_gasoil" stackId="real" fill={GASOIL} name="Gas Oil" isAnimationActive={false} />
        <Bar dataKey="cammesa_fueloil" stackId="real" fill={FUELOIL} name="Fuel Oil" isAnimationActive={false} />
        <Bar dataKey="cammesa_carbon" stackId="real" fill={CARBON} name="Carbón" isAnimationActive={false} />

        {/* Programación semanal / proyectado: apilado en stack independiente para no colisionar */}
        <Bar dataKey="cammesa_gas_est" stackId="est" fill={GAS} fillOpacity={0.6} name="Gas est." legendType="none" isAnimationActive={false} />
        <Bar dataKey="cammesa_gasoil_est" stackId="est" fill={GASOIL} fillOpacity={0.6} name="Gas Oil est." legendType="none" isAnimationActive={false} />
        <Bar dataKey="cammesa_fueloil_est" stackId="est" fill={FUELOIL} fillOpacity={0.6} name="Fuel Oil est." legendType="none" isAnimationActive={false} />
        <Bar dataKey="cammesa_carbon_est" stackId="est" fill={CARBON} fillOpacity={0.6} name="Carbón est." legendType="none" isAnimationActive={false} />

        {/* PPO overlay: línea de dato cerrado */}
        <Line
          type="monotone"
          dataKey="ppo_gas"
          stroke={PPO_LINE}
          strokeWidth={1.5}
          dot={{ r: 2 }}
          name="PPO gas (dato cerrado)"
          connectNulls={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
