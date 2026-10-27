import type { ImpactoDia, MantenimientoFila } from '../../types/mantenimientos'

export type Estado = 'en_curso' | 'proximo' | 'futuro' | 'finalizado'

export const DIAS_PROXIMOS = 7

export const ESTADO_ORDEN: Estado[] = ['en_curso', 'proximo', 'futuro', 'finalizado']

export const ESTADO_TITULO: Record<Estado, string> = {
  en_curso: 'En curso',
  proximo: 'Próximos 7 días',
  futuro: 'Más adelante',
  finalizado: 'Finalizados',
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Dates travel as ISO strings (yyyy-mm-dd) and are compared as strings; arithmetic goes
// through UTC so daylight-saving changes never shift a day.
function parseISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function hoyISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function sumarDias(iso: string, n: number): string {
  return new Date(parseISO(iso) + n * 86_400_000).toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((parseISO(hasta) - parseISO(desde)) / 86_400_000)
}

export function esFinDeSemana(iso: string): boolean {
  const dow = new Date(parseISO(iso)).getUTCDay()
  return dow === 0 || dow === 6
}

export function estadoDe(f: MantenimientoFila, hoy: string): Estado {
  if (f.fecha_hasta < hoy) return 'finalizado'
  if (f.fecha_desde <= hoy) return 'en_curso'
  if (f.fecha_desde <= sumarDias(hoy, DIAS_PROXIMOS)) return 'proximo'
  return 'futuro'
}

export function fmtDia(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

export function fmtRango(desde: string, hasta: string): string {
  return desde === hasta ? fmtDia(desde) : `${fmtDia(desde)} → ${fmtDia(hasta)}`
}

export function nombreMes(mesIndex: number): string {
  return MESES[mesIndex] ?? ''
}

// Comma-decimal number with up to 2 decimals: 2 -> "2", 14.7 -> "14,7".
export function fmtMM(x: number): string {
  return x.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')
}

export function totalReduccion(d: ImpactoDia): number {
  return d.reduccion_transporte + d.reduccion_inyeccion + d.reduccion_otros
}

export function ordenarPorFecha(a: MantenimientoFila, b: MantenimientoFila): number {
  return (
    a.fecha_desde.localeCompare(b.fecha_desde) ||
    a.fecha_hasta.localeCompare(b.fecha_hasta) ||
    a.empresa.localeCompare(b.empresa)
  )
}

// "CUENCA NORTE + TRAMOS FINALES" -> "Cuenca Norte + Tramos Finales"
export function fmtCuenca(nombre: string): string {
  return nombre
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

export function tituloFila(f: MantenimientoFila): string {
  return f.instalacion ?? f.tarea ?? '—'
}
