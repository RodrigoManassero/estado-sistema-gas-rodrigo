import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Legend } from 'recharts'
import type { DailyRow, ETGSRow, LinepackForecastDay } from '../types'
import type { TGNSystemStateRow } from '../hooks/useData'
import { padToDates, formatTooltipDate, weekendSpans } from '../utils/charts'

const fmt = (d: string) => d.slice(5)

const TGS = '#10b981'
const TGN = '#3b82f6'

function firstValid<K extends keyof DailyRow>(data: DailyRow[], key: K): number | null {
  for (const row of data) {
    const v = row[key]
    if (typeof v === 'number') return v
  }
  return null
}

function toMMm3(raw: string | undefined | null): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[^\d.-]/g, ''))
  if (isNaN(n)) return null
  return n / 1_000_000
}

interface Props {
  data: DailyRow[]
  etgsRows?: ETGSRow[]
  tgnRows?: TGNSystemStateRow[]
  forecast?: LinepackForecastDay[]
  allDates?: string[]
}

export default function LinepackChart({ data, etgsRows = [], tgnRows = [], forecast = [], allDates }: Props) {
  const limInfTgs = firstValid(data, 'lim_inf_tgs')
  const limSupTgs = firstValid(data, 'lim_sup_tgs')
  const limInfTgn = firstValid(data, 'lim_inf_tgn')
  const limSupTgn = firstValid(data, 'lim_sup_tgn')

  const tgsByDate = new Map<string, number>()
  for (const r of etgsRows) {
    if (r.fecha && typeof r.linepack_tgs_dia_actual === 'number') {
      tgsByDate.set(r.fecha, r.linepack_tgs_dia_actual)
    }
  }

  const tgnByDate = new Map<string, number>()
  for (const r of tgnRows) {
    const f = r.fecha
    const v = toMMm3(r['Actual'])
    if (f && v != null) tgnByDate.set(f, v)
  }

  const tgsEstByDate = new Map<string, number>()
  const tgnEstByDate = new Map<string, number>()
  for (const f of forecast) {
    if (f.linepack_tgs_est != null) tgsEstByDate.set(f.fecha, f.linepack_tgs_est)
    if (f.linepack_tgn_est != null) tgnEstByDate.set(f.fecha, f.linepack_tgn_est)
  }

  const fechaSet = new Set<string>()
  for (const d of data) if (d.fecha) fechaSet.add(d.fecha)
  for (const f of tgsByDate.keys()) fechaSet.add(f)
  for (const f of tgnByDate.keys()) fechaSet.add(f)
  for (const f of forecast) fechaSet.add(f.fecha)
  const allFechas = Array.from(fechaSet).sort()

  const dailyByDate = new Map<string, DailyRow>()
  for (const d of data) dailyByDate.set(d.fecha, d)

  // Identificar el último día con dato real disponible
  const lastReal = [...allFechas].reverse().find((fecha) => {
    const dr = dailyByDate.get(fecha)
    const tgsVal = (typeof dr?.linepack_tgs === 'number' ? dr.linepack_tgs : tgsByDate.get(fecha)) ?? null
    const tgnVal = (typeof dr?.linepack_tgn === 'number' ? dr.linepack_tgn : tgnByDate.get(fecha)) ?? null
    return tgsVal != null || tgnVal != null
  }) ?? ''

  const base = allFechas.map((fecha) => {
    const dr = dailyByDate.get(fecha)
    const tgsReal = (typeof dr?.linepack_tgs === 'number' ? dr.linepack_tgs : tgsByDate.get(fecha)) ?? null
    const tgnReal = (typeof dr?.linepack_tgn === 'number' ? dr.linepack_tgn : tgnByDate.get(fecha)) ?? null

    const isOverlap = fecha === lastReal
    const isForecast = fecha >= lastReal

    return {
      fecha,
      // Mantenemos dato real solo hasta lastReal
      tgs: lastReal && fecha > lastReal ? null : tgsReal,
      tgn: lastReal && fecha > lastReal ? null : tgnReal,
      // En el empalme (lastReal) asignamos el valor real a la serie estimada para unificar las líneas
      tgs_est: isOverlap ? tgsReal : (isForecast ? (tgsEstByDate.get(fecha) ?? null) : null),
      tgn_est: isOverlap ? tgnReal : (isForecast ? (tgnEstByDate.get(fecha) ?? null) : null),
    }
  })

  const rows = allDates ? padToDates(base, allDates) : base
  const weekends = weekendSpans(rows.map((r) => r.fecha))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} syncId="outlook">
        <XAxis dataKey="fecha" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
        {/* Eje Y fijado de 110 a 240 */}
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} domain={[110, 240]} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={formatTooltipDate}
          formatter={(v: any, name: any, item: any) => {
            // Ocultar las métricas estimadas (_est) en la fecha de unificación para no duplicar en el Tooltip
            if (item.payload.fecha === lastReal && String(item.dataKey).endsWith('_est')) {
              return [null, null]
            }
            return typeof v === 'number' ? [v.toFixed(1), name] : ['-', name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {weekends.map(([s, e], i) => (
          <ReferenceArea key={`wk-${i}`} x1={s} x2={e} fill="#64748b" fillOpacity={0.08} strokeOpacity={0} ifOverflow="extendDomain" />
        ))}
        {lastReal && (tgsEstByDate.size > 0 || tgnEstByDate.size > 0) && (
          <ReferenceLine x={lastReal} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'Hoy', fill: '#64748b', fontSize: 10 }} />
        )}

        {limInfTgs != null && (
          <ReferenceLine y={limInfTgs} stroke={TGS} strokeDasharray="4 4" strokeOpacity={0.5}
            label={{ value: `TGS min ${limInfTgs}`, fill: TGS, fontSize: 10, position: 'insideBottomLeft' }} />
        )}
        {limSupTgs != null && (
          <ReferenceLine y={limSupTgs} stroke={TGS} strokeDasharray="4 4" strokeOpacity={0.5}
            label={{ value: `TGS max ${limSupTgs}`, fill: TGS, fontSize: 10, position: 'insideTopLeft' }} />
        )}
        {limInfTgn != null && (
          <ReferenceLine y={limInfTgn} stroke={TGN} strokeDasharray="4 4" strokeOpacity={0.5}
            label={{ value: `TGN min ${limInfTgn}`, fill: TGN, fontSize: 10, position: 'insideBottomLeft' }} />
        )}
        {limSupTgn != null && (
          <ReferenceLine y={limSupTgn} stroke={TGN} strokeDasharray="4 4" strokeOpacity={0.5}
            label={{ value: `TGN max ${limSupTgn}`, fill: TGN, fontSize: 10, position: 'insideTopLeft' }} />
        )}

        <Line type="monotone" dataKey="tgs" stroke={TGS} strokeWidth={2} dot={false} name="TGS" connectNulls />
        <Line type="monotone" dataKey="tgn" stroke={TGN} strokeWidth={2} dot={false} name="TGN" connectNulls />

        {/* Proyección: Nombres ajustados sin paréntesis */}
        <Line type="monotone" dataKey="tgs_est" stroke={TGS} strokeWidth={2} strokeDasharray="5 5" dot={false} name="TGS est." legendType="none" connectNulls />
        <Line type="monotone" dataKey="tgn_est" stroke={TGN} strokeWidth={2} strokeDasharray="5 5" dot={false} name="TGN est." legendType="none" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}
