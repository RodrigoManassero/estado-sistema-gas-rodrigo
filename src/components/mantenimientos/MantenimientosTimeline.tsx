import type { CSSProperties } from 'react'
import type { CategoriaKey, MantenimientoFila } from '../../types'
import { CATEGORIA_LABEL, mt } from './tokens'
import { diasEntre, esFinDeSemana, fmtRango, nombreMes, ordenarPorFecha, sumarDias, tituloFila } from './utils'

interface Props {
  filas: MantenimientoFila[]
  hoy: string
  maxDias?: number // how far ahead of today the chart reaches (default 120)
}

const LABEL_W = 230
const DAY_PX = 16
const ROW_H = 28
const MIN_PX_FOR_TEXT = 56

export function MantenimientosTimeline({ filas, hoy, maxDias = 120 }: Props) {
  const vigentes = filas.filter((f) => f.fecha_hasta >= hoy).sort(ordenarPorFecha)

  if (vigentes.length === 0) {
    return <div style={{ color: mt.muted, fontSize: 13 }}>No hay mantenimientos vigentes para mostrar.</div>
  }

  const inicio = sumarDias(hoy, -2)
  const finMax = sumarDias(hoy, maxDias)
  const finDatos = vigentes.reduce((m, f) => (f.fecha_hasta > m ? f.fecha_hasta : m), hoy)
  const fin = finDatos > finMax ? finMax : finDatos
  const total = diasEntre(inicio, fin) + 1
  const dias = Array.from({ length: total }, (_, i) => sumarDias(inicio, i))
  const trackW = total * DAY_PX
  const pct = (n: number) => `${(n / total) * 100}%`

  // Month header segments.
  const meses: { key: string; label: string; start: number; count: number }[] = []
  dias.forEach((iso, i) => {
    const key = iso.slice(0, 7)
    const last = meses[meses.length - 1]
    if (last && last.key === key) last.count += 1
    else meses.push({ key, label: `${nombreMes(Number(iso.slice(5, 7)) - 1)} ${iso.slice(0, 4)}`, start: i, count: 1 })
  })

  const hoyIdx = diasEntre(inicio, hoy)

  const labelCell: CSSProperties = {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    width: LABEL_W,
    minWidth: LABEL_W,
    background: mt.surface,
    boxSizing: 'border-box',
    padding: '0 8px',
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: mt.muted, marginBottom: 8 }}>
        {(Object.keys(CATEGORIA_LABEL) as CategoriaKey[]).map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 8, borderRadius: 2, background: mt.categoria[k] }} />
            {CATEGORIA_LABEL[k]}
          </span>
        ))}
        <span>Barra tenue = sin impacto</span>
        <span style={{ color: mt.today }}>| Hoy</span>
      </div>

      <div style={{ overflow: 'auto hidden', border: `1px solid ${mt.border}`, borderRadius: mt.radius }}>
        <div style={{ width: LABEL_W + trackW, position: 'relative' }}>
          {/* month header */}
          <div style={{ display: 'flex', height: 24, borderBottom: `1px solid ${mt.border}` }}>
            <span style={{ ...labelCell, fontSize: 12, color: mt.muted }}>Mantenimiento</span>
            <div style={{ position: 'relative', width: trackW }}>
              {meses.map((m) => (
                <div
                  key={m.key}
                  style={{
                    position: 'absolute',
                    left: pct(m.start),
                    width: pct(m.count),
                    top: 0,
                    bottom: 0,
                    paddingLeft: 6,
                    fontSize: 12,
                    color: mt.muted,
                    borderLeft: `1px solid ${mt.border}`,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* body: weekend bands and today line sit behind/above the rows */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_W, width: trackW, pointerEvents: 'none' }}>
              {dias.map((iso, i) =>
                esFinDeSemana(iso) ? (
                  <span key={iso} style={{ display: 'block', position: 'absolute', left: pct(i), width: pct(1), top: 0, bottom: 0, background: mt.band }} />
                ) : null,
              )}
              <span
                style={{
                  display: 'block',
                  position: 'absolute',
                  left: pct(hoyIdx + 0.5),
                  width: 2,
                  marginLeft: -1,
                  top: 0,
                  bottom: 0,
                  background: mt.today,
                  zIndex: 1,
                }}
              />
            </div>

            {vigentes.map((f) => {
              const desde = f.fecha_desde < inicio ? inicio : f.fecha_desde
              const hasta = f.fecha_hasta > fin ? fin : f.fecha_hasta
              const left = diasEntre(inicio, desde)
              const span = diasEntre(desde, hasta) + 1
              const texto = span * DAY_PX >= MIN_PX_FOR_TEXT ? f.impacto_texto : ''
              const tip = [
                `${f.empresa} — ${tituloFila(f)}`,
                fmtRango(f.fecha_desde, f.fecha_hasta),
                f.tarea ?? '',
                `Afectación: ${f.impacto_texto} MM m³/d`,
              ]
                .filter(Boolean)
                .join('\n')
              return (
                <div key={f.id} style={{ display: 'flex', height: ROW_H, borderBottom: `1px solid ${mt.border}` }}>
                  <span style={{ ...labelCell, fontSize: 12 }} title={tip}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <strong>{f.empresa}</strong> · {tituloFila(f)}
                    </span>
                  </span>
                  <div style={{ position: 'relative', width: trackW }}>
                    <span
                      title={tip}
                      style={{
                        display: 'block',
                        position: 'absolute',
                        left: pct(left),
                        width: pct(span),
                        top: 5,
                        height: ROW_H - 10,
                        borderRadius: 4,
                        background: mt.categoria[f.categoria_key],
                        opacity: f.sin_impacto ? 0.4 : 0.9,
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 600,
                        lineHeight: `${ROW_H - 10}px`,
                        paddingLeft: 6,
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {texto}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
