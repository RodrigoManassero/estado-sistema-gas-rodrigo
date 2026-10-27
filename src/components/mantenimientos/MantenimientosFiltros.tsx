import type { MantenimientoCategoria, MantenimientoFila } from '../../types'
import { FilterChips, type OpcionChip } from './FilterChips'
import {
  FILTROS_INICIALES,
  SIN_GASODUCTO,
  TODAS,
  conteos,
  filtrosActivos,
  ordenarSistemas,
  type Filtros,
} from './filtros'
import { CATEGORIA_LABEL, mt } from './tokens'
import { estadoDe, fmtCuenca } from './utils'

interface Props {
  filas: MantenimientoFila[]
  hoy: string
  filtros: Filtros
  onChange: (f: Filtros) => void
  totalVisible: number
}

function conTodas(opciones: OpcionChip[], counts: Map<string, number>): OpcionChip[] {
  const total = Array.from(counts.values()).reduce((n, c) => n + c, 0)
  return [{ id: TODAS, label: 'Todas', count: total }, ...opciones]
}

export function MantenimientosFiltros({ filas, hoy, filtros, onChange, totalVisible }: Props) {
  const set = (patch: Partial<Filtros>) => onChange({ ...filtros, ...patch })

  // Options come from the rows that pass the "finished" rule; counts also respect the other filters.
  const base = filas.filter((f) => filtros.verFinalizados || estadoDe(f, hoy) !== 'finalizado')

  const cCat = conteos(filas, filtros, hoy, 'categoria', (f) => f.categoria_key)
  const categorias = conTodas(
    (Object.keys(CATEGORIA_LABEL) as MantenimientoCategoria[]).map((k) => ({
      id: k,
      label: CATEGORIA_LABEL[k],
      count: cCat.get(k) ?? 0,
      color: mt.categoria[k],
    })),
    cCat,
  )

  const cCuenca = conteos(filas, filtros, hoy, 'cuenca', (f) => f.cuenca)
  const cuencas = conTodas(
    Array.from(new Set(base.map((f) => f.cuenca)))
      .sort()
      .map((c) => ({ id: c, label: fmtCuenca(c).replace(/^Cuenca /, ''), count: cCuenca.get(c) ?? 0 })),
    cCuenca,
  )

  const cSis = conteos(filas, filtros, hoy, 'sistema', (f) => f.sistema)
  const sistemas = conTodas(
    ordenarSistemas(Array.from(new Set(base.map((f) => f.sistema)))).map((s) => ({
      id: s,
      label: s,
      count: cSis.get(s) ?? 0,
    })),
    cSis,
  )

  // Second level: only when a system is picked and it has at least one named pipeline.
  let gasoductos: OpcionChip[] | null = null
  if (filtros.sistema !== TODAS) {
    const delSistema = base.filter((f) => f.sistema === filtros.sistema)
    const nombres = Array.from(new Set(delSistema.map((f) => f.gasoducto).filter((g): g is string => !!g))).sort()
    const hayIndefinidos = delSistema.some((f) => !f.gasoducto)
    // A single named pipeline with nothing unspecified adds no choice, so the row stays hidden.
    if (nombres.length > 1 || (nombres.length === 1 && hayIndefinidos)) {
      const cGto = conteos(filas, filtros, hoy, 'gasoducto', (f) => f.gasoducto ?? SIN_GASODUCTO)
      const opciones: OpcionChip[] = nombres.map((g) => ({ id: g, label: g, count: cGto.get(g) ?? 0 }))
      if (hayIndefinidos) {
        opciones.push({ id: SIN_GASODUCTO, label: 'Sin especificar', count: cGto.get(SIN_GASODUCTO) ?? 0 })
      }
      gasoductos = conTodas(opciones, cGto)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <FilterChips titulo="Sistema" opciones={sistemas} valor={filtros.sistema} onChange={(id) => set({ sistema: id, gasoducto: TODAS })} />
      {gasoductos ? (
        <FilterChips titulo="Gasoducto" opciones={gasoductos} valor={filtros.gasoducto} onChange={(id) => set({ gasoducto: id })} />
      ) : null}
      <FilterChips titulo="Categoría" opciones={categorias} valor={filtros.categoria} onChange={(id) => set({ categoria: id as Filtros['categoria'] })} />
      <FilterChips titulo="Cuenca" opciones={cuencas} valor={filtros.cuenca} onChange={(id) => set({ cuenca: id })} />

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 2 }}>
        <label style={{ fontSize: 12, color: mt.muted, cursor: 'pointer' }}>
          <input type="checkbox" checked={filtros.verFinalizados} onChange={(e) => set({ verFinalizados: e.target.checked })} /> Mostrar
          finalizados
        </label>
        {filtrosActivos(filtros) ? (
          <button
            type="button"
            onClick={() => onChange(FILTROS_INICIALES)}
            style={{ background: 'none', border: 'none', color: mt.muted, textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0 }}
          >
            Limpiar filtros
          </button>
        ) : null}
        <span style={{ fontSize: 12, color: mt.muted, marginLeft: 'auto' }}>
          {totalVisible} {totalVisible === 1 ? 'mantenimiento' : 'mantenimientos'}
        </span>
      </div>
    </div>
  )
}
