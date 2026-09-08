import { useMemo, useState } from 'react'
import type { PlanDesarrollo } from '../hooks/useData'
import { colors, radius, space } from '../theme'

interface Props {
  planes: PlanDesarrollo[]
}

const CATEGORY_COLORS: Record<string, string> = {
  estrategia: '#8b5cf6',
  upstream: '#3b82f6',
  midstream: '#06b6d4',
  infraestructura: '#10b981',
  'M&A': '#f59e0b',
  desinversión: '#ef4444',
}
const CATEGORY_LABELS: Record<string, string> = {
  estrategia: 'Estrategia',
  upstream: 'Upstream',
  midstream: 'Midstream',
  infraestructura: 'Infraestructura',
  'M&A': 'M&A',
  desinversión: 'Desinversión',
}

function categoryColor(c: string): string {
  return CATEGORY_COLORS[c] ?? colors.textDim
}

function formatAnuncio(s: string): string {
  // "2024-08" -> "ago 2024", "2024" -> "2024", "2024-Q4" -> "Q4 2024"
  if (/^\d{4}-Q\d$/.test(s)) {
    const [y, q] = s.split('-')
    return `${q} ${y}`
  }
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1))
      .toLocaleDateString('es-AR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return s
}

function montoLabel(usdM: number | null): string | null {
  if (usdM == null) return null
  if (usdM >= 1000) return `US$ ${(usdM / 1000).toFixed(usdM >= 10000 ? 0 : 1)} B`
  return `US$ ${usdM.toLocaleString('es-AR')} M`
}

type Sort = 'recent' | 'monto' | 'operador'

export default function PlanesDesarrolloTimeline({ planes }: Props) {
  const [sort, setSort] = useState<Sort>('recent')
  const [filterCat, setFilterCat] = useState<string | null>(null)

  const categorias = useMemo(() => {
    const set = new Set<string>()
    for (const p of planes) set.add(p.categoria)
    return [...set]
  }, [planes])

  const sorted = useMemo(() => {
    const base = filterCat ? planes.filter((p) => p.categoria === filterCat) : planes
    const arr = [...base]
    if (sort === 'recent') {
      arr.sort((a, b) => (b.fecha_anuncio || '').localeCompare(a.fecha_anuncio || ''))
    } else if (sort === 'monto') {
      arr.sort((a, b) => (b.monto_usd_millones ?? -1) - (a.monto_usd_millones ?? -1))
    } else if (sort === 'operador') {
      arr.sort((a, b) => a.operador.localeCompare(b.operador, 'es-AR'))
    }
    return arr
  }, [planes, sort, filterCat])

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: space.sm,
          marginBottom: space.md,
          alignItems: 'center',
          fontSize: 12,
          color: colors.textDim,
        }}
      >
        <span>ordenar:</span>
        {(['recent', 'monto', 'operador'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            style={pillBtn(sort === k)}
          >
            {k === 'recent' ? 'recientes' : k === 'monto' ? 'monto US$' : 'operador'}
          </button>
        ))}
        <span style={{ marginLeft: space.md }}>categoría:</span>
        <button onClick={() => setFilterCat(null)} style={pillBtn(filterCat == null)}>
          todas
        </button>
        {categorias.map((c) => (
          <button
            key={c}
            onClick={() => setFilterCat(filterCat === c ? null : c)}
            style={{ ...pillBtn(filterCat === c), color: categoryColor(c) }}
          >
            {CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
        {sorted.map((p) => {
          const cat = categoryColor(p.categoria)
          const monto = montoLabel(p.monto_usd_millones)
          return (
            <article
              key={p.id}
              style={{
                background: colors.surfaceAlt,
                border: `1px solid ${colors.border}`,
                borderLeft: `3px solid ${cat}`,
                borderRadius: radius.md,
                padding: `${space.md}px ${space.lg}px`,
              }}
            >
              <header
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: space.sm,
                  marginBottom: 6,
                }}
              >
                <div>
                  <div style={{ color: colors.textPrimary, fontSize: 14, fontWeight: 700 }}>
                    {p.titulo}
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {p.operador}
                    {p.horizonte ? <span style={{ color: colors.textDim }}> · {p.horizonte}</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {monto && (
                    <span
                      style={{
                        color: colors.textPrimary,
                        background: cat + '22',
                        border: `1px solid ${cat}55`,
                        borderRadius: radius.pill,
                        padding: '2px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {monto}
                    </span>
                  )}
                  <span
                    style={{
                      color: cat,
                      background: cat + '14',
                      borderRadius: radius.pill,
                      padding: '2px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {CATEGORY_LABELS[p.categoria] ?? p.categoria}
                  </span>
                  <span style={{ color: colors.textDim, fontSize: 12 }}>
                    {formatAnuncio(p.fecha_anuncio)}
                  </span>
                </div>
              </header>
              <p style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                {p.comentario}
              </p>
              {p.fuente_url && (
                <a
                  href={p.fuente_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-block',
                    marginTop: space.sm,
                    color: colors.accent.blue,
                    fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  Fuente ↗
                </a>
              )}
            </article>
          )
        })}
      </div>

      <p style={{ color: colors.textDim, fontSize: 11, marginTop: space.md, lineHeight: 1.5 }}>
        Curación manual desde comunicados oficiales, earnings calls y prensa. La lista no pretende ser
        exhaustiva — apunta a dar contexto del pipeline de inversiones. Pedir a Claude que sume entradas
        o editá <code>public/data/planes_desarrollo.json</code> directamente.
      </p>
    </div>
  )
}

const pillBtn = (active: boolean): React.CSSProperties => ({
  background: active ? colors.border : 'transparent',
  color: active ? colors.textPrimary : colors.textDim,
  border: 'none',
  borderRadius: radius.sm,
  padding: '2px 10px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
})
