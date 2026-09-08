/**
 * Year-over-year chart data helpers. Given a flat list of rows keyed by
 * "YYYY-MM-DD", build a dataset keyed by "MM-DD" with one column per year so
 * Recharts can render historical comparisons on a shared calendar axis.
 */

export interface YearOverYearRow {
  mmdd: string
  /** Numeric values keyed by year, e.g. { '2024': 351.7, '2025': 348.2, '2026': 355.1 } */
  [year: string]: string | number | null
}

interface HistoricalRow {
  fecha?: string
  [field: string]: unknown
}

/**
 * Group rows by calendar day (MM-DD), one column per year.
 * Useful for "linepack 2024 vs 2025 vs 2026 on the same Jan–Dec axis" views.
 */
export function byYear<T extends HistoricalRow>(
  rows: T[],
  valueKey: keyof T,
): { rows: YearOverYearRow[]; years: string[] } {
  const years = new Set<string>()
  const byKey = new Map<string, YearOverYearRow>()

  for (const row of rows) {
    const fecha = row.fecha
    if (!fecha || fecha.length < 10) continue
    const year = fecha.slice(0, 4)
    const mmdd = fecha.slice(5)
    years.add(year)
    const existing = byKey.get(mmdd) ?? { mmdd }
    const raw = row[valueKey]
    if (typeof raw === 'number') existing[year] = raw
    byKey.set(mmdd, existing)
  }

  // Fill every day of year so lines connect cleanly.
  const calendar = buildCalendar()
  const result: YearOverYearRow[] = calendar.map((mmdd) => byKey.get(mmdd) ?? { mmdd })
  return { rows: result, years: [...years].sort() }
}

function buildCalendar(): string[] {
  const days: string[] = []
  for (let m = 1; m <= 12; m++) {
    const daysInMonth = new Date(2024, m, 0).getDate() // 2024 is a leap year; use longest month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }
  return days
}

export interface HistoricalBandRow {
  mmdd: string
  min: number | null
  max: number | null
  avg: number | null
  current: number | null
}

/**
 * For each calendar day, compute min/avg/max from prior years and pair with
 * the current-year value. Renders as "EIA storage report" style: a grey band
 * (historical range) with the current year overlaid.
 */
export function historicalBand<T extends HistoricalRow>(
  rows: T[],
  valueKey: keyof T,
): HistoricalBandRow[] {
  const currentYear = String(new Date().getFullYear())
  const byKey = new Map<string, { prior: number[]; current: number | null }>()

  for (const row of rows) {
    const fecha = row.fecha
    if (!fecha || fecha.length < 10) continue
    const year = fecha.slice(0, 4)
    const mmdd = fecha.slice(5)
    const raw = row[valueKey]
    if (typeof raw !== 'number') continue
    const entry = byKey.get(mmdd) ?? { prior: [], current: null }
    if (year === currentYear) {
      entry.current = raw
    } else {
      entry.prior.push(raw)
    }
    byKey.set(mmdd, entry)
  }

  return buildCalendar().map((mmdd) => {
    const entry = byKey.get(mmdd)
    if (!entry || entry.prior.length === 0) {
      return {
        mmdd,
        min: null,
        max: null,
        avg: null,
        current: entry?.current ?? null,
      }
    }
    const sum = entry.prior.reduce((a, b) => a + b, 0)
    return {
      mmdd,
      min: Math.round(Math.min(...entry.prior) * 10) / 10,
      max: Math.round(Math.max(...entry.prior) * 10) / 10,
      avg: Math.round((sum / entry.prior.length) * 10) / 10,
      current: entry.current ?? null,
    }
  })
}
