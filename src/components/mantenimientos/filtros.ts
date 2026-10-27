import type { MantenimientoCategoria, MantenimientoFila } from '../../types'
import { estadoDe } from './utils'

export const TODAS = 'todas'
export const SIN_GASODUCTO = '__sin_gasoducto__'

// Preferred order of the top-level systems; anything else goes after, alphabetically.
export const SISTEMA_ORDEN = ['TGN', 'TGS', 'Enarsa', 'Productores', 'Demanda y otros']

export interface Filtros {
  categoria: MantenimientoCategoria | typeof TODAS
  cuenca: string
  sistema: string
  gasoducto: string
  verFinalizados: boolean
}

export const FILTROS_INICIALES: Filtros = {
  categoria: TODAS,
  cuenca: TODAS,
  sistema: TODAS,
  gasoducto: TODAS,
  verFinalizados: false,
}

export type ClaveFiltro = 'categoria' | 'cuenca' | 'sistema' | 'gasoducto'

export function filtrosActivos(f: Filtros): boolean {
  return (
    f.categoria !== TODAS ||
    f.cuenca !== TODAS ||
    f.sistema !== TODAS ||
    f.gasoducto !== TODAS ||
    f.verFinalizados
  )
}

// `omitir` skips one filter so we can count how many rows each of its options would give.
function coincide(f: MantenimientoFila, filtros: Filtros, hoy: string, omitir?: ClaveFiltro): boolean {
  if (!filtros.verFinalizados && estadoDe(f, hoy) === 'finalizado') return false
  if (omitir !== 'categoria' && filtros.categoria !== TODAS && f.categoria_key !== filtros.categoria) return false
  if (omitir !== 'cuenca' && filtros.cuenca !== TODAS && f.cuenca !== filtros.cuenca) return false
  if (omitir !== 'sistema' && filtros.sistema !== TODAS && f.sistema !== filtros.sistema) return false
  if (omitir !== 'gasoducto' && filtros.gasoducto !== TODAS && (f.gasoducto ?? SIN_GASODUCTO) !== filtros.gasoducto) {
    return false
  }
  return true
}

export function aplicarFiltros(filas: MantenimientoFila[], filtros: Filtros, hoy: string): MantenimientoFila[] {
  return filas.filter((f) => coincide(f, filtros, hoy))
}

export function conteos(
  filas: MantenimientoFila[],
  filtros: Filtros,
  hoy: string,
  omitir: ClaveFiltro,
  clave: (f: MantenimientoFila) => string,
): Map<string, number> {
  const m = new Map<string, number>()
  for (const f of filas) {
    if (!coincide(f, filtros, hoy, omitir)) continue
    const k = clave(f)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export function ordenarSistemas(sistemas: string[]): string[] {
  const rank = (s: string) => {
    const i = SISTEMA_ORDEN.indexOf(s)
    return i === -1 ? SISTEMA_ORDEN.length : i
  }
  return [...sistemas].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}
