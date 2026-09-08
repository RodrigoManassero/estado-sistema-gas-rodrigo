// Shared choropleth helpers for the SVG maps. A 7-step monochromatic warm ramp
// (dark brown → amber) that reads well on the dark dashboard background and
// avoids the "rainbow" confusion of a multi-hue palette. Binning is quantile
// based (rank, not value) so a single extreme outlier (e.g. CABA's density)
// doesn't collapse everyone else into one bucket.

// Warm ramp tuned for a dark basemap: every step keeps enough luminance to read
// over the slate map (the original dark-brown floor blended into the background).
// Drawn at full opacity so the colors render true rather than muddied by the
// basemap showing through.
export const HEAT_PALETTE = ['#b45309', '#d97706', '#ea580c', '#f97316', '#fb923c', '#fbbf24', '#fde047']
export const NO_DATA = '#475569'

/** One threshold per palette step (HEAT_PALETTE.length - 1 thresholds) from the
 *  positive values, by quantile. */
export function quantileBins(values: number[]): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return []
  const out: number[] = []
  for (let i = 1; i < HEAT_PALETTE.length; i++) {
    const idx = Math.floor((i * sorted.length) / HEAT_PALETTE.length)
    out.push(sorted[Math.min(idx, sorted.length - 1)])
  }
  return out
}

export function densityColor(value: number, bins: number[]): string {
  if (value <= 0 || bins.length === 0) return NO_DATA
  let idx = 0
  while (idx < bins.length && value >= bins[idx]) idx++
  return HEAT_PALETTE[idx] ?? HEAT_PALETTE[HEAT_PALETTE.length - 1]
}

/** Human labels for the legend: HEAT_PALETTE.length labels from the thresholds. */
export function formatBins(bins: number[]): string[] {
  const fmt = (v: number): string => {
    if (v === 0) return '0'
    if (v < 1) return v.toFixed(2)
    if (v < 10) return v.toFixed(1)
    if (v < 1000) return v.toFixed(0)
    return `${(v / 1000).toFixed(1)}k`
  }
  const labels: string[] = [`< ${fmt(bins[0])}`]
  for (let i = 1; i < bins.length; i++) labels.push(`${fmt(bins[i - 1])}+`)
  labels.push(`≥ ${fmt(bins[bins.length - 1])}`)
  return labels
}
