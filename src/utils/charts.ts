/**
 * Shared chart-axis helpers so every time-series chart renders the same X range
 * (fechas) and, where units match, the same Y range. Charts stay independent —
 * they just receive common axis props instead of computing them individually.
 */

export interface ChartAxes {
  /** Every fecha (yyyy-mm-dd) present in any source, sorted ascending. */
  allDates: string[]
  /** Y domain shared by demand-related charts in MMm³/d. */
  demandYDomain: [number, number]
}

interface DateCarrier {
  fecha: string
}

/** Union + sort of every fecha across the provided series. */
export function collectDates(...series: DateCarrier[][]): string[] {
  const set = new Set<string>()
  for (const s of series) for (const r of s) set.add(r.fecha)
  return [...set].sort()
}

/**
 * Pad a series so it has one row per fecha in `allDates`. Missing rows are
 * filled with `{ fecha }` only — downstream chart library treats absent
 * numeric keys as null (no gap in axis).
 */
export function padToDates<T extends DateCarrier>(rows: T[], allDates: string[]): (T | DateCarrier)[] {
  const byDate = new Map(rows.map((r) => [r.fecha, r]))
  return allDates.map((d) => byDate.get(d) ?? { fecha: d })
}

/** Round up to the next multiple of `step` (for nicer Y-axis tops). */
function roundUp(n: number, step: number): number {
  return Math.ceil(n / step) * step
}

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** "2026-04-20" -> "lun 20/4". Used as Recharts tooltip label formatter. */
export function formatTooltipDate(fecha: string): string {
  if (!fecha || fecha.length < 10) return fecha
  const dt = new Date(fecha + 'T12:00:00')
  if (isNaN(dt.getTime())) return fecha
  return `${DOW[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}`
}

/**
 * Given an ordered list of fechas (YYYY-MM-DD), return [saturday, sunday]
 * pairs — used as x1/x2 bounds for weekend ReferenceArea bands.
 * Each pair covers a single weekend; if a fecha happens to be Saturday with
 * no Sunday visible (end of range), we still emit [sat, sat] so it shows.
 */
export function weekendSpans(dates: string[]): [string, string][] {
  const spans: [string, string][] = []
  for (let i = 0; i < dates.length; i++) {
    const iso = dates[i]
    if (!iso || iso.length < 10) continue
    const dt = new Date(iso + 'T12:00:00')
    if (isNaN(dt.getTime())) continue
    const dow = dt.getDay()
    // Saturday = 6. Span ends at the following Sunday if visible.
    if (dow === 6) {
      const next = dates[i + 1]
      if (next) spans.push([iso, next])
      else spans.push([iso, iso])
    } else if (dow === 0 && (i === 0 || new Date(dates[i - 1] + 'T12:00:00').getDay() !== 6)) {
      // Isolated Sunday at start of range — weekend still needs marking.
      spans.push([iso, iso])
    }
  }
  return spans
}

export type TimeScale = '7d' | '30d' | '90d' | 'all'

/**
 * Filter the full date range to the window implied by `scale`. History is
 * counted back from today; forecast (future) dates are always kept so the
 * "+ forecast" tail stays visible.
 */
export function filterDatesByScale(allDates: string[], scale: TimeScale): string[] {
  if (scale === 'all' || allDates.length === 0) return allDates
  const today = new Date().toISOString().slice(0, 10)
  const daysBack = scale === '7d' ? 7 : scale === '30d' ? 30 : 90
  const cutoff = new Date(today + 'T00:00:00')
  cutoff.setDate(cutoff.getDate() - daysBack)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  return allDates.filter((d) => d >= cutoffIso)
}

interface DemandInputs {
  demanda_total?: number | null
  prioritaria?: number | null
  industria?: number | null
  usinas?: number | null
  exportaciones?: number | null
}

/** Compute a Y-domain that fits every demand series we render. */
export function demandYDomain(
  historical: DemandInputs[],
  forecast: { demanda_total_est?: number | null }[],
): [number, number] {
  const historicalMax = Math.max(
    0,
    ...historical.flatMap((d) => [
      d.demanda_total ?? 0,
      // Stacked areas: the top is demanda_total; individual sectors are always ≤ total.
    ]),
  )
  const forecastMax = Math.max(0, ...forecast.map((f) => f.demanda_total_est ?? 0))
  const top = Math.max(historicalMax, forecastMax)
  return [0, top === 0 ? 10 : roundUp(top * 1.1, 10)]
}
