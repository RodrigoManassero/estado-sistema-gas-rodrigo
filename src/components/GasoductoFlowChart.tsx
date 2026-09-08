import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { colors, sectionTitle } from '../theme'
import type { GasoductoRow, CuencaRow } from '../hooks/useData'

const fmt = (d: string) => d.slice(0, 7) // YYYY-MM

/**
 * Monthly gas receipts by pipeline (GRT "por Gasoducto"). Stacked area so
 * TGS/TGN contributions visually sum to the national total; palette groups
 * TGS (greens/yellow) vs TGN (blues) vs distribution (grey).
 *
 * Raw data comes in thousand m³/month; we divide by 1000 for MMm³/month.
 */
interface FlowProps {
  rows: GasoductoRow[]
  monthsBack?: number
}

const GASODUCTO_COLORS: Record<string, string> = {
  tgs_neuba: '#10b981',
  tgs_san_martin: '#34d399',
  tgs_otros: '#6ee7b7',
  tgn_centro_oeste: '#3b82f6',
  tgn_norte: '#60a5fa',
  tgn_otros: '#93c5fd',
  distr_malargue: '#94a3b8',
  distr_sur: '#94a3b8',
  distr_otros: '#94a3b8',
}
const GASODUCTO_LABELS: Record<string, string> = {
  tgs_neuba: 'TGS · Neuba I+II',
  tgs_san_martin: 'TGS · Gral San Martín',
  tgs_otros: 'TGS · otros',
  tgn_centro_oeste: 'TGN · Centro Oeste',
  tgn_norte: 'TGN · Norte',
  tgn_otros: 'TGN · otros',
  distr_malargue: 'Distr · Malargüe',
  distr_sur: 'Distr · Sur',
  distr_otros: 'Distr · otros',
}

export function GasoductoFlowChart({ rows, monthsBack = 36 }: FlowProps) {
  const data = useMemo(() => {
    return rows.slice(-monthsBack).map((r) => ({
      fecha: r.fecha,
      tgs_neuba: (r.tgs_neuba ?? 0) / 1000,
      tgs_san_martin: (r.tgs_san_martin ?? 0) / 1000,
      tgs_otros: (r.tgs_otros ?? 0) / 1000,
      tgn_centro_oeste: (r.tgn_centro_oeste ?? 0) / 1000,
      tgn_norte: (r.tgn_norte ?? 0) / 1000,
      tgn_otros: (r.tgn_otros ?? 0) / 1000,
      distr_malargue: (r.distr_malargue ?? 0) / 1000,
      distr_sur: (r.distr_sur ?? 0) / 1000,
      distr_otros: (r.distr_otros ?? 0) / 1000,
    }))
  }, [rows, monthsBack])

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} syncId="monthly">
        <XAxis dataKey="fecha" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" minTickGap={30} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} unit=" MMm³" />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={(d: string) => `Mes ${d.slice(0, 7)}`}
          formatter={(v: number, n: string) => [`${v.toFixed(0)} MMm³/mes`, GASODUCTO_LABELS[n] ?? n]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value: string) => GASODUCTO_LABELS[value] ?? value} />
        {Object.keys(GASODUCTO_COLORS).map((k) => (
          <Area key={k} type="monotone" dataKey={k} stackId="1" fill={GASODUCTO_COLORS[k]} stroke={GASODUCTO_COLORS[k]} name={k} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

interface CuencaProps {
  rows: CuencaRow[]
  monthsBack?: number
}

const CUENCA_COLORS: Record<string, string> = {
  tgs_neuquina: '#10b981',
  tgs_san_jorge: '#34d399',
  tgs_austral: '#6ee7b7',
  tgs_otros: '#a7f3d0',
  tgn_neuquina: '#3b82f6',
  tgn_noroeste: '#60a5fa',
  tgn_otros: '#93c5fd',
  distribuidoras_propios: '#94a3b8',
  otros_origenes: '#475569',
}
const CUENCA_LABELS: Record<string, string> = {
  tgs_neuquina: 'TGS · Cuenca Neuquina',
  tgs_san_jorge: 'TGS · San Jorge',
  tgs_austral: 'TGS · Austral',
  tgs_otros: 'TGS · otros',
  tgn_neuquina: 'TGN · Cuenca Neuquina',
  tgn_noroeste: 'TGN · Noroeste',
  tgn_otros: 'TGN · otros',
  distribuidoras_propios: 'Distribuidoras propios',
  otros_origenes: 'Otros orígenes',
}

export function CuencaFlowChart({ rows, monthsBack = 36 }: CuencaProps) {
  const data = useMemo(() => {
    return rows.slice(-monthsBack).map((r) => {
      const scaled: Record<string, string | number> = { fecha: r.fecha }
      for (const k of Object.keys(CUENCA_COLORS)) {
        const v = (r as never as Record<string, number | null>)[k]
        scaled[k] = v != null ? v / 1000 : 0
      }
      return scaled
    })
  }, [rows, monthsBack])

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} syncId="monthly">
        <XAxis dataKey="fecha" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" minTickGap={30} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} unit=" MMm³" />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={(d: string) => `Mes ${d.slice(0, 7)}`}
          formatter={(v: number, n: string) => [`${v.toFixed(0)} MMm³/mes`, CUENCA_LABELS[n] ?? n]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value: string) => CUENCA_LABELS[value] ?? value} />
        {Object.keys(CUENCA_COLORS).map((k) => (
          <Area key={k} type="monotone" dataKey={k} stackId="1" fill={CUENCA_COLORS[k]} stroke={CUENCA_COLORS[k]} name={k} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function RegionalSection({ monthly }: { monthly: { gas_recibido?: { cuenca: CuencaRow[]; gasoducto: GasoductoRow[] } } | null | undefined }) {
  if (!monthly?.gas_recibido) return null
  return (
    <>
      <div style={{ marginTop: 20 }}>
        <h3 style={sectionTitle}>
          Gas recibido por Gasoducto (mensual)
          <span style={{ float: 'right', fontSize: 11, color: colors.textDim, textTransform: 'none', fontWeight: 400 }}>
            Fuente: ENARGAS datos-estadísticos · últimos 3 años
          </span>
        </h3>
        <GasoductoFlowChart rows={monthly.gas_recibido.gasoducto} />
      </div>
      <div style={{ marginTop: 20 }}>
        <h3 style={sectionTitle}>
          Gas recibido por Cuenca (mensual)
          <span style={{ float: 'right', fontSize: 11, color: colors.textDim, textTransform: 'none', fontWeight: 400 }}>
            Origen del gas que entra al sistema de transporte
          </span>
        </h3>
        <CuencaFlowChart rows={monthly.gas_recibido.cuenca} />
      </div>
    </>
  )
}
