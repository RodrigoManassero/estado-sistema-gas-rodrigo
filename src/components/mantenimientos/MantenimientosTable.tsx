import { Fragment, useMemo, useState, type CSSProperties } from 'react'
import type { CategoriaKey, MantenimientoFila } from '../../types'
import { CategoriaTag } from './CategoriaTag'
import { EstadoChip } from './EstadoChip'
import { ImpactoBadge } from './ImpactoBadge'
import { CATEGORIA_LABEL, mt } from './tokens'
import {
  ESTADO_ORDEN,
  estadoDe,
  fmtCuenca,
  fmtRango,
  ordenarPorFecha,
  tituloFila,
  type Estado,
} from './utils'

interface Props {
  filas: MantenimientoFila[]
  hoy: string
}

type CategoriaFiltro = 'todas' | CategoriaKey

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
const select: CSSProperties = { padding: '4px 8px', borderRadius: mt.radius, border: `1px solid ${mt.border}`, background: 'transparent', color: 'inherit' }

export function MantenimientosTable({ filas, hoy }: Props) {
  const [verFinalizados, setVerFinalizados] = useState(false)
  const [categoria, setCategoria] = useState<CategoriaFiltro>('todas')
  const [cuenca, setCuenca] = useState('todas')
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set())

  const cuencas = useMemo(() => Array.from(new Set(filas.map((f) => f.cuenca))).sort(), [filas])

  const grupos = useMemo(() => {
    const out = new Map<Estado, MantenimientoFila[]>(ESTADO_ORDEN.map((e) => [e, []]))
    for (const f of filas) {
      if (categoria !== 'todas' && f.categoria_key !== categoria) continue
      if (cuenca !== 'todas' && f.cuenca !== cuenca) continue
      const e = estadoDe(f, hoy)
      if (e === 'finalizado' && !verFinalizados) continue
      out.get(e)?.push(f)
    }
    for (const lista of out.values()) lista.sort(ordenarPorFecha)
    return out
  }, [filas, hoy, categoria, cuenca, verFinalizados])

  const total = Array.from(grupos.values()).reduce((n, l) => n + l.length, 0)

  const toggle = (id: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: 13 }}>
          Categoría{' '}
          <select style={select} value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaFiltro)}>
            <option value="todas">Todas</option>
            {(Object.keys(CATEGORIA_LABEL) as CategoriaKey[]).map((k) => (
              <option key={k} value={k}>
                {CATEGORIA_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Cuenca{' '}
          <select style={select} value={cuenca} onChange={(e) => setCuenca(e.target.value)}>
            <option value="todas">Todas</option>
            {cuencas.map((c) => (
              <option key={c} value={c}>
                {fmtCuenca(c)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={verFinalizados} onChange={(e) => setVerFinalizados(e.target.checked)} /> Mostrar
          finalizados
        </label>
        <span style={{ fontSize: 12, color: mt.muted, marginLeft: 'auto' }}>{total} mantenimientos</span>
      </div>

      <div style={{ overflow: 'auto hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={th}>Fechas</th>
              <th style={th}>Empresa</th>
              <th style={th}>Instalación / tarea</th>
              <th style={th}>Categoría</th>
              <th style={{ ...th, textAlign: 'right' }}>Afectación (MM m³/d)</th>
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
                      <EstadoChip estado={estado} />{' '}
                      <span style={{ fontSize: 12, color: mt.muted }}>({lista.length})</span>
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
                          <td style={td}>
                            <div style={{ fontWeight: 600 }}>{f.empresa}</div>
                            <div style={{ fontSize: 12, color: mt.muted }}>{fmtCuenca(f.cuenca)}</div>
                          </td>
                          <td style={td}>
                            <div>{tituloFila(f)}</div>
                            {f.tarea && f.instalacion ? (
                              <div style={{ fontSize: 12, color: mt.muted }}>{f.tarea}</div>
                            ) : null}
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
                              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13 }}>
                                {f.comentario_raw}
                              </pre>
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
            {total === 0 ? (
              <tr>
                <td colSpan={COLS} style={{ ...td, color: mt.muted, textAlign: 'center' }}>
                  No hay mantenimientos con esos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
