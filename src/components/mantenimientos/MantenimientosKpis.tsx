import type { CSSProperties } from 'react'
import type { MantenimientoImpactoDia, MantenimientoFila } from '../../types'
import { mt } from './tokens'
import { estadoDe, fmtDia, fmtMM, sumarDias, totalReduccion } from './utils'

interface Props {
  filas: MantenimientoFila[]
  impactoDiario: MantenimientoImpactoDia[]
  hoy: string
}

const card: CSSProperties = {
  border: `1px solid ${mt.border}`,
  borderRadius: mt.radius,
  padding: '12px 14px',
}
const label: CSSProperties = { fontSize: 12, color: mt.muted, marginBottom: 4 }
const value: CSSProperties = { fontSize: 26, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }
const sub: CSSProperties = { fontSize: 12, color: mt.muted, marginTop: 4 }

const NOTA_SUMA =
  'Suma simple de los impactos informados en el Excel. No es la restricción efectiva del sistema.'

export function MantenimientosKpis({ filas, impactoDiario, hoy }: Props) {
  const enCurso = filas.filter((f) => estadoDe(f, hoy) === 'en_curso').length
  const proximos = filas.filter((f) => estadoDe(f, hoy) === 'proximo').length

  const dHoy = impactoDiario.find((d) => d.fecha === hoy)
  const limite = sumarDias(hoy, 30)
  const ventana = impactoDiario.filter((d) => d.fecha >= hoy && d.fecha <= limite)
  const pico = ventana.reduce<MantenimientoImpactoDia | null>(
    (m, d) => (m === null || totalReduccion(d) > totalReduccion(m) ? d : m),
    null,
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
      <div style={card}>
        <div style={label}>En curso hoy</div>
        <div style={value}>{enCurso}</div>
        <div style={sub}>mantenimientos</div>
      </div>

      <div style={card}>
        <div style={label}>Próximos 7 días</div>
        <div style={value}>{proximos}</div>
        <div style={sub}>mantenimientos por comenzar</div>
      </div>

      <div style={card} title={NOTA_SUMA}>
        <div style={label}>Reducción informada hoy</div>
        <div style={value}>
          {dHoy ? fmtMM(totalReduccion(dHoy)) : '—'}
          <span style={{ fontSize: 13, fontWeight: 400, color: mt.muted }}> MM m³/d</span>
        </div>
        <div style={sub}>
          {dHoy
            ? `Transp. ${fmtMM(dHoy.reduccion_transporte)} · Iny. ${fmtMM(dHoy.reduccion_inyeccion)} · Otros ${fmtMM(dHoy.reduccion_otros)}`
            : 'Sin datos para hoy'}
        </div>
      </div>

      <div style={card} title={NOTA_SUMA}>
        <div style={label}>Día de mayor reducción (30 días)</div>
        <div style={value}>
          {pico ? fmtMM(totalReduccion(pico)) : '—'}
          <span style={{ fontSize: 13, fontWeight: 400, color: mt.muted }}> MM m³/d</span>
        </div>
        <div style={sub}>{pico ? fmtDia(pico.fecha) : 'Sin datos'}</div>
      </div>
    </div>
  )
}
