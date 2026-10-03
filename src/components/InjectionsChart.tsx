import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
  ReferenceLine,
} from 'recharts'
import type { DailyRow } from '../types'
import { formatTooltipDate, weekendSpans, getTodayIso } from '../utils/charts'

const fmt = (d: string) => (d && d.length >= 10 ? d.slice(5, 10) : d)

interface Props {
  data: DailyRow[]
  allDates?: string[]
}

const COLORS = {
  tgs: '#10b981',
  tgn: '#3b82f6',
  gpm: '#f59e0b',
  bolivia: '#ef4444',
  escobar: '#6b7280',
}

export default function InjectionsChart({ data, allDates }: Props) {
  const rawRows = data || []
  const todayIso = getTodayIso() // Obtenemos la fecha actual real (YYYY-MM-DD)

  // 1. Identificar si una fila es forecast
  const isForecastRow = (r: any) =>
    r.origen === 'MODELO_FORECAST' || r.tipo === 'F' || Boolean(r.isForecast)

  // 2. Encontrar el corte histórico para separar las series visuales
  const lastHistorical = useMemo(() => {
    const realRows = rawRows.filter((r) => !isForecastRow(r))
    return realRows.length > 0 ? realRows[realRows.length - 1].fecha : ''
  }, [rawRows])

  // 3. Separar los datos en capa Real y Forecast
  const rows = useMemo(() => {
    const dateSet = allDates && allDates.length > 0 ? new Set(allDates) : null
    const filtered = dateSet ? rawRows.filter((r) => dateSet.has(r.fecha)) : rawRows

    return filtered.map((r) => {
      const gpmVal = (r as any).iny_gpm ?? (r as any).iny_enarsa ?? 0
      const isFc = isForecastRow(r)
      const isHistorical = !lastHistorical || r.fecha <= lastHistorical
      const isOverlap = r.fecha === lastHistorical

      const tgs = isHistorical ? r.iny_tgs ?? null : null
      const tgn = isHistorical ? r.iny_tgn ?? null : null
      const gpm = isHistorical ? gpmVal : null
      const bolivia = isHistorical ? r.iny_bolivia ?? null : null
      const escobar = isHistorical ? r.iny_escobar ?? null : null

      let tgsEst: number | null = null
      let tgnEst: number | null = null
      let gpmEst: number | null = null
      let boliviaEst: number | null = null
      let escobarEst: number | null = null

      if (isFc || isOverlap) {
        tgsEst = r.iny_tgs ?? null
        tgnEst = r.iny_tgn ?? null
        gpmEst = gpmVal
        boliviaEst = r.iny_bolivia ?? null
        escobarEst = r.iny_escobar ?? null
      }

      return {
        ...r,
        isForecast: isFc,
        iny_tgs: tgs,
        iny_tgn: tgn,
        iny_gpm: gpm,
        iny_bolivia: bolivia,
        iny_escobar: escobar,
        iny_tgs_est: tgsEst,
        iny_tgn_est: tgnEst,
        iny_gpm_est: gpmEst,
        iny_bolivia_est: boliviaEst,
        iny_escobar_est: escobarEst,
      }
    })
  }, [rawRows, allDates, lastHistorical])

  const weekends = weekendSpans(rows.map((r) => r.fecha))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={rows} syncId="outlook">
        <XAxis
          dataKey="fecha"
          tickFormatter={fmt}
          tick={{ fill: '#64748b', fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />

        <Tooltip
          contentStyle={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
          }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={(label: any) => formatTooltipDate(label)}
          formatter={(value: any, name: any, item: any) => {
            if (item.payload.fecha === lastHistorical && String(item.dataKey).endsWith('_est')) {
              return [null, null]
            }
            if (value === null || value === undefined) return [null, null]
            return [`${Number(value).toFixed(1)}`, name]
          }}
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

        {/* Línea vertical referenciada a la FECHA REAL DE HOY del sistema */}
        <ReferenceLine
          x={todayIso}
          stroke="#64748b"
          strokeDasharray="3 3"
          label={{
            value: 'Hoy',
            fill: '#64748b',
            fontSize: 10,
            position: 'center',
          }}
        />

        {/* Capa Histórica (Sólida) */}
        <Area type="monotone" dataKey="iny_tgs" stackId="real" fill={COLORS.tgs} stroke={COLORS.tgs} fillOpacity={0.85} name="TGS" isAnimationActive={false} />
        <Area type="monotone" dataKey="iny_tgn" stackId="real" fill={COLORS.tgn} stroke={COLORS.tgn} fillOpacity={0.85} name="TGN" isAnimationActive={false} />
        <Area type="monotone" dataKey="iny_gpm" stackId="real" fill={COLORS.gpm} stroke={COLORS.gpm} fillOpacity={0.85} name="GPM" isAnimationActive={false} />
        <Area type="monotone" dataKey="iny_bolivia" stackId="real" fill={COLORS.bolivia} stroke={COLORS.bolivia} fillOpacity={0.85} name="Bolivia" isAnimationActive={false} />
        <Area type="monotone" dataKey="iny_escobar" stackId="real" fill={COLORS.escobar} stroke={COLORS.escobar} fillOpacity={0.85} name="Escobar" isAnimationActive={false} />

        {/* Capa Forecast (Translúcida + Punteada) */}
        <Area type="monotone" dataKey="iny_tgs_est" stackId="est" fill={COLORS.tgs} stroke={COLORS.tgs} fillOpacity={0.15} strokeWidth={1} strokeDasharray="4 3" name="TGS est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="iny_tgn_est" stackId="est" fill={COLORS.tgn} stroke={COLORS.tgn} fillOpacity={0.15} strokeWidth={1} strokeDasharray="4 3" name="TGN est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="iny_gpm_est" stackId="est" fill={COLORS.gpm} stroke={COLORS.gpm} fillOpacity={0.15} strokeWidth={1} strokeDasharray="4 3" name="GPM est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="iny_bolivia_est" stackId="est" fill={COLORS.bolivia} stroke={COLORS.bolivia} fillOpacity={0.15} strokeWidth={1} strokeDasharray="4 3" name="Bolivia est." legendType="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="iny_escobar_est" stackId="est" fill={COLORS.escobar} stroke={COLORS.escobar} fillOpacity={0.15} strokeWidth={1} strokeDasharray="4 3" name="Escobar est." legendType="none" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
