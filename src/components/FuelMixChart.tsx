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

const fmt = (d: string) => (d && d.length >= 10 ? d.slice(5, 10) : d)

const clean = (f: string | undefined | null) => {
  if (!f) return ''
  return f.trim().split(' ')[0].split('T')[0]
}

interface Props {
  data: DailyRow[]
  ppoRows?: CammesaPPORow[]
  demandForecast?: DemandForecastDay[]
  allDates?: string[]
}

const GAS = '#3b82f6'
const GASOIL = '#f59e0b'
const FUELOIL = '#ef4444'
const CARBON = '#6b7280'
const PPO_LINE = '#e2e8f0'

export default function FuelMixChart({ data, ppoRows = [], demandForecast = [], allDates }: Props) {
  const ppoByDate = new Map<string, number>()
  for (const r of ppoRows) {
    const fClean = clean(r.fecha)
    if (fClean && typeof r.gas_mmm3 === 'number') ppoByDate.set(fClean, r.gas_mmm3)
  }

  const historical = data
    .map((d) => ({ ...d, fecha: clean(d.fecha) }))
    .filter((d) => d.cammesa_gas != null)
    .map((d) => ({
      fecha: d.fecha,
      cammesa_gas: d.cammesa_gas,
      cammesa_gasoil: d.cammesa_gasoil,
      cammesa_fueloil: d.cammesa_fueloil,
      cammesa_carbon: d.cammesa_carbon,
      ppo_gas: ppoByDate.get(d.fecha) ?? null,
      cammesa_gas_weekly: null as number | null,
      cammesa_gas_est: null as number | null,
      cammesa_gasoil_est: null as number | null,
      cammesa_fueloil_est: null as number | null,
      cammesa_carbon_est: null as number | null,
    }))
  const lastHistorical = historical[historical.length - 1]?.fecha ?? ''

  const excelFechas = new Set(historical.map((h) => h.fecha))
  const ppoExtraRows = ppoRows
    .map((r) => ({ ...r, fecha: clean(r.fecha) }))
    .filter((r) => r.fecha && !excelFechas.has(r.fecha) && r.fecha <= lastHistorical)
    .map((r) => ({
      fecha: r.fecha,
      cammesa_gas: null as number | null,
      cammesa_gasoil: null as number | null,
      cammesa_fueloil: null as number | null,
      cammesa_carbon: null as number | null,
      ppo_gas: r.gas_mmm3 ?? null,
      cammesa_gas_weekly: null as number | null,
      cammesa_gas_est: null as number | null,
      cammesa_gasoil_est: null as number | null,
      cammesa_fueloil_est: null as number | null,
      cammesa_carbon_est: null as number | null,
    }))

  const usinasByDate = new Map<string, number>()
  for (const f of demandForecast) {
    const fClean = clean(f.fecha)
    if (fClean > lastHistorical && f.usinas_est != null) {
      usinasByDate.set(fClean, f.usinas_est)
    }
  }

  const dailyByDate = new Map(data.map((d) => [clean(d.fecha), d]))
  const fcDates = new Set<string>()

  for (const d of data) {
    const fClean = clean(d.fecha)
    if (fClean > lastHistorical && d.cammesa_gas_est != null) {
      fcDates.add(fClean)
    }
  }
  for (const f of usinasByDate.keys()) fcDates.add(f)

  // 1. Ultima fecha con Weekly de CAMMESA
  const lastWeeklyRow = [...data]
    .map((d) => ({ ...d, fecha: clean(d.fecha) }))
    .filter((d) => d.fecha > lastHistorical && d.cammesa_gas_est != null)
    .pop()

  const lastWeeklyDate = lastWeeklyRow?.fecha ?? ''
  const lastWeeklyVal = lastWeeklyRow?.cammesa_gas_est ?? null

  // 2. Bias del modelo respecto al final del Weekly
  const modelValAtWeeklyEnd = lastWeeklyDate ? usinasByDate.get(lastWeeklyDate) : null
  const localGasBias =
    lastWeeklyVal != null && modelValAtWeeklyEnd != null
      ? lastWeeklyVal - modelValAtWeeklyEnd
      : 0

  // 3. Generacion de filas separando Weekly (Sólido) y Modelo (Translúcido)
  const forecastRows = [...fcDates].sort().map((fecha) => {
    const d = dailyByDate.get(fecha)
    const u = usinasByDate.get(fecha)

    let gasWeekly: number | null = null
    let gasEstModel: number | null = null

    if (d?.cammesa_gas_est != null) {
      // Dato Oficial CAMMESA Weekly -> Sólido
      gasWeekly = d.cammesa_gas_est
    } else if (u != null) {
      // Estimación Modelo por Clima -> Translúcido
      gasEstModel = Math.round((u + localGasBias) * 10) / 10
    }

    return {
      fecha,
      cammesa_gas: null as number | null,
      cammesa_gasoil: null as number | null,
      cammesa_fueloil: null as number | null,
      cammesa_carbon: null as number | null,
      ppo_gas: null as number | null,
      cammesa_gas_weekly: gasWeekly,
      cammesa_gas_est: gasEstModel,
      cammesa_gasoil_est: d?.cammesa_gasoil_est ?? null,
      cammesa_fueloil_est: d?.cammesa_fueloil_est ?? null,
      cammesa_carbon_est: d?.cammesa_carbon_est ?? null,
    }
  })

  const merged = new Map<string, any>()
  ;[...ppoExtraRows, ...historical, ...forecastRows].forEach((r) => merged.set(r.fecha, r))

  const base = [...merged.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const rows = allDates ? padToDates(base, allDates) : base
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
        {forecastRows.length > 0 && lastHistorical && (
          <ReferenceLine
            x={lastHistorical}
            stroke="#64748b"
            strokeDasharray="3 3"
            label={{ value: 'Hoy', fill: '#64748b', fontSize: 10 }}
          />
        )}
        {/* Cerrado: mezcla real apilada (Sólido) */}
        <Bar dataKey="cammesa_gas" stackId="1" fill={GAS} name="Gas" isAnimationActive={false} />
        <Bar dataKey="cammesa_gasoil" stackId="1" fill={GASOIL} name="Gas Oil" isAnimationActive={false} />
        <Bar dataKey="cammesa_fueloil" stackId="1" fill={FUELOIL} name="Fuel Oil" isAnimationActive={false} />
        <Bar dataKey="cammesa_carbon" stackId="1" fill={CARBON} name="Carbón" isAnimationActive={false} />

        {/* CAMMESA Weekly (Sólido) */}
        <Bar dataKey="cammesa_gas_weekly" stackId="1" fill={GAS} legendType="none" isAnimationActive={false} />

        {/* Estimación modelo (Translúcido) */}
        <Bar dataKey="cammesa_gas_est" stackId="1" fill={GAS} fillOpacity={0.45} name="Gas est." legendType="none" isAnimationActive={false} />
        <Bar dataKey="cammesa_gasoil_est" stackId="1" fill={GASOIL} fillOpacity={0.45} name="Gas Oil est." legendType="none" isAnimationActive={false} />
        <Bar dataKey="cammesa_fueloil_est" stackId="1" fill={FUELOIL} fillOpacity={0.45} name="Fuel Oil est." legendType="none" isAnimationActive={false} />
        <Bar dataKey="cammesa_carbon_est" stackId="1" fill={CARBON} fillOpacity={0.45} name="Carbón est." legendType="none" isAnimationActive={false} />

        {/* PPO overlay */}
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
