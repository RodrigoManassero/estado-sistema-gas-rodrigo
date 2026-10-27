import type { SignoImpacto } from '../../types'
import { mt } from './tokens'

interface Props {
  texto: string
  signo: SignoImpacto
}

export function ImpactoBadge({ texto, signo }: Props) {
  const c = mt.signo[signo]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: mt.radius,
        background: c.bg,
        color: c.fg,
        fontWeight: 600,
        fontSize: 13,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  )
}
