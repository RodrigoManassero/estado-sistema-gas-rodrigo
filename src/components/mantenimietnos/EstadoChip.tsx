import { mt } from './tokens'
import { ESTADO_TITULO, type Estado } from './utils'

export function EstadoChip({ estado }: { estado: Estado }) {
  const c = mt.estado[estado]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      {ESTADO_TITULO[estado]}
    </span>
  )
}
