import type { DailyRow } from '../types'

export type AlertLevel = 'info' | 'warn' | 'err'

export interface Alert {
  level: AlertLevel
  message: string
}

// Linepack vs operating bands. Daily.json carries lim_inf/lim_sup for TGS+TGN
// (manually maintained in the Excel). Trip threshold = within 3% of limit.
export function linepackAlerts(latest: DailyRow | undefined): Alert[] {
  if (!latest) return []
  const out: Alert[] = []
  for (const which of ['tgs', 'tgn'] as const) {
    const lp = latest[`linepack_${which}`] as number | null
    const lo = latest[`lim_inf_${which}`] as number | null
    const hi = latest[`lim_sup_${which}`] as number | null
    if (lp == null) continue
    const label = which.toUpperCase()
    if (lo != null && lp < lo) {
      out.push({ level: 'err', message: `Linepack ${label} ${lp.toFixed(1)} MMm³ por debajo del límite inferior (${lo.toFixed(1)})` })
    } else if (lo != null && lp < lo * 1.03) {
      out.push({ level: 'warn', message: `Linepack ${label} ${lp.toFixed(1)} MMm³ próximo al límite inferior (${lo.toFixed(1)})` })
    } else if (hi != null && lp > hi) {
      out.push({ level: 'warn', message: `Linepack ${label} ${lp.toFixed(1)} MMm³ por encima del límite superior (${hi.toFixed(1)})` })
    }
  }
  return out
}
