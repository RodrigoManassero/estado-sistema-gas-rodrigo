import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { colors, iconBtn, radius, space } from '../theme'

export interface TrendPoint {
  fecha: string // YYYY-MM
  mmm3: number | null
}

/** Monthly gas-consumption trend (MMm³) for a selected province. Rendered below
 *  the system map when a province is selected. */
export default function ProvinciaTrendPanel({
  provinciaName,
  series,
  onClose,
}: {
  provinciaName: string
  series: TrendPoint[]
  onClose: () => void
}) {
  return (
    <div style={{ marginTop: space.md, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: space.md }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm }}>
        <div style={{ color: colors.textPrimary, fontSize: 14, fontWeight: 700 }}>
          {provinciaName}
          <span style={{ color: colors.textDim, fontWeight: 400, fontSize: 12 }}> — consumo mensual (MMm³)</span>
        </div>
        <button onClick={onClose} style={{ ...iconBtn, width: 'auto', padding: '2px 10px' }} title="Cerrar">✕</button>
      </div>
      {series.length > 0 ? (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={series} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="provFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.accent.orange} stopOpacity={0.5} />
                <stop offset="100%" stopColor={colors.accent.orange} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis dataKey="fecha" tick={{ fill: colors.textDim, fontSize: 10 }} minTickGap={40} />
            <YAxis tick={{ fill: colors.textDim, fontSize: 10 }} width={44} />
            <Tooltip
              contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 12 }}
              labelStyle={{ color: colors.textMuted }}
              formatter={(v: number) => [`${v.toFixed(1)} MMm³`, 'Consumo']}
            />
            <Area type="monotone" dataKey="mmm3" stroke={colors.accent.orange} fill="url(#provFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ color: colors.textDim, fontSize: 12 }}>Sin serie disponible.</div>
      )}
    </div>
  )
}
