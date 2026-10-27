import { mt } from './tokens'

export interface OpcionChip {
  id: string
  label: string
  count: number
  color?: string // optional dot color (used by the category filter)
}

interface Props {
  titulo: string
  opciones: OpcionChip[]
  valor: string
  onChange: (id: string) => void
}

// Pill buttons instead of a native <select>: readable on the dark theme, and every option is
// visible at once with how many maintenances it would show.
export function FilterChips({ titulo, opciones, valor, onChange }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: mt.muted, minWidth: 78 }}>{titulo}</span>
      {opciones.map((o) => {
        const activo = o.id === valor
        const vacio = o.count === 0 && !activo
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={activo}
            disabled={vacio}
            style={{
              background: activo ? mt.border : 'transparent',
              color: activo ? mt.text : mt.muted,
              border: `1px solid ${mt.border}`,
              borderRadius: mt.radius,
              padding: '3px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: vacio ? 'default' : 'pointer',
              opacity: vacio ? 0.45 : 1,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {o.color ? <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: o.color }} /> : null}
            {o.label}
            <span style={{ fontWeight: 400, opacity: 0.75 }}>{o.count}</span>
          </button>
        )
      })}
    </div>
  )
}
