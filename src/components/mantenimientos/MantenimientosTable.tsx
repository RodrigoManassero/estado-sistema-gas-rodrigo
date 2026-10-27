import { Fragment, useMemo, useState, type CSSProperties } from 'react'
import type { MantenimientoFila } from '../../types'
import { CategoriaTag } from './CategoriaTag'
import { EstadoChip } from './EstadoChip'
import { ImpactoBadge } from './ImpactoBadge'
import { mt } from './tokens'
import { ESTADO_ORDEN, estadoDe, fmtCuenca, fmtRango, ordenarPorFecha, tituloFila, type Estado } from './utils'

interface Props {
  filas: MantenimientoFila[] // already filtered by MantenimientosFiltros
  hoy: string
}

const COLS = 5

const th: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 12,
  color: mt.muted,
  fontWeight: 600,
  borderBottom: `1px solid ${mt.border}`,
}
const td: CSSProperties = { padding: '8px 10px', verticalAlign: 'top', borderBottom: `1px solid ${mt.border}` }

export function MantenimientosTable({ filas, hoy }: Props) {
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set())

  const grupos = useMemo(() => {
    const out = new Map<Estado, MantenimientoFila[]>(ESTADO_ORDEN.map((e) => [e, []]))
    for (const f of filas) out.get(estadoDe(f, hoy))?.push(f)
    for (const lista of out.values()) lista.sort(ordenarPorFecha)
    return out
  }, [filas, hoy])

  const toggle = (id: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div style={{ overflow: 'auto hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th style={th}>Fechas</th>
            <th style={th}>Empresa</th>
            <th style={th}>Instalación / tarea</th>
            <th style={th}>Categoría</th>
            <th style={{ ...th, textAlign: 'right', whiteSpace: 'nowrap' }}>Afectación (MM m³/d)</th>
          </tr>
        </thead>
        <tbody>
          {ESTADO_ORDEN.map((estado) => {
            const lista = grupos.get(estado) ?? []
            if (lista.length === 0) return null
            return (
              <Fragment key={estado}>
                <tr>
                  <td colSpan={COLS} style={{ padding: '14px 10px 6px' }}>
                    <EstadoChip estado={estado} /> <span style={{ fontSize: 12, color: mt.muted }}>({lista.length})</span>
                  </td>
                </tr>
                {lista.map((f) => {
                  const abierto = abiertos.has(f.id)
                  return (
                    <Fragment key={f.id}>
                      <tr>
                        <td style={td}>
                          <button
                            type="button"
                            onClick={() => toggle(f.id)}
                            aria-expanded={abierto}
                            aria-label={abierto ? 'Ocultar detalle' : 'Ver detalle'}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, marginRight: 6 }}
                          >
                            {abierto ? '▾' : '▸'}
                          </button>
                          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtRango(f.fecha_desde, f.fecha_hasta)}</strong>
                          <div style={{ fontSize: 12, color: mt.muted, marginLeft: 18 }}>
                            {f.dias} {f.dias === 1 ? 'día' : 'días'}
                          </div>
                        </td>
                        <td style={{ ...td, minWidth: 150 }}>
                          <div style={{ fontWeight: 600 }}>{f.empresa}</div>
                          {f.gasoducto ? (
                            <div style={{ fontSize: 12, color: mt.text, whiteSpace: 'nowrap' }}>Gto. {f.gasoducto}</div>
                          ) : null}
                          <div style={{ fontSize: 12, color: mt.muted }}>{fmtCuenca(f.cuenca)}</div>
                        </td>
                        <td style={td}>
                          <div>{tituloFila(f)}</div>
                          {f.tarea && f.instalacion ? <div style={{ fontSize: 12, color: mt.muted }}>{f.tarea}</div> : null}
                        </td>
                        <td style={td}>
                          <CategoriaTag categoria={f.categoria_key} />
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <ImpactoBadge texto={f.impacto_texto} signo={f.signo_impacto} />
                        </td>
                      </tr>
                      {abierto ? (
                        <tr>
                          <td colSpan={COLS} style={{ ...td, background: mt.band }}>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13 }}>{f.comentario_raw}</pre>
                            <div style={{ fontSize: 12, color: mt.muted, marginTop: 8 }}>
                              Celdas {f.celda_desde}–{f.celda_hasta} del Excel
                              {f.autores.length > 0 ? ` · ${f.autores.join(', ')}` : ''}
                              {f.multiples_trabajos ? ' · El comentario reúne varios trabajos' : ''}
                              {f.texto_variable_durante_evento ? ' · El texto cambia durante el evento' : ''}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </Fragment>
            )
          })}
          {filas.length === 0 ? (
            <tr>
              <td colSpan={COLS} style={{ ...td, color: mt.muted, textAlign: 'center' }}>
                No hay mantenimientos con esos filtros.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
