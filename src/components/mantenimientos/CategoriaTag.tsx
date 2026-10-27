import type { MantenimientoCategoria } from '../../types'
import { CATEGORIA_LABEL, mt } from './tokens'

export function CategoriaTag({ categoria }: { categoria: MantenimientoCategoria }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: mt.muted }}>
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: '50%', background: mt.categoria[categoria] }}
      />
      {CATEGORIA_LABEL[categoria]}
    </span>
  )
}
