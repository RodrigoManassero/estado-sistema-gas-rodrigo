import { card, colors, radius, sectionTitle, space } from '../theme'
import type { TGNSystemStateRow } from '../hooks/useData'

interface Props {
  rows: TGNSystemStateRow[] | null
  generatedAt: string | null
  /** Proyección de linepack TGN (MMm³) por fecha. Cuando ABII no publicó el
   *  día, se muestra la estimación marcada "(est.)"; los derivados quedan en —. */
  estByDate?: Map<string, number>
}

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
}

// 'Thu May 28 00:00:00 ART 2026' -> '2026-05-28'. Used as a fallback for
// rows from older runs that don't carry a precomputed 'fecha' field.
function parseJavaDate(raw: string | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/^\w+\s+(\w+)\s+(\d{1,2})\s+\d{2}:\d{2}:\d{2}\s+\w+\s+(\d{4})$/)
  if (!m) return null
  const mon = MONTHS[m[1]]
  if (!mon) return null
  return `${m[3]}-${String(mon).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

function rowFecha(r: { fecha?: string | null; 'Día Operativo'?: string }): string {
  return r.fecha ?? parseJavaDate(r['Día Operativo']) ?? ''
}

function toNumber(s: string | undefined): number | null {
  if (!s) return null
  const n = Number(s.replace(/[^\d.-]/g, ''))
  return isNaN(n) ? null : n
}

function fmtMMm3(m3: number | null): string {
  if (m3 == null) return '—'
  return `${(m3 / 1_000_000).toFixed(2)} MMm³`
}

function fmtPct(p: number | null, signed = false): string {
  if (p == null) return '—'
  return `${signed && p > 0 ? '+' : ''}${p.toFixed(2)}%`
}

// Color the deviation by severity. Same thresholds used elsewhere
// to flag operational stress.
function severityColor(absPct: number | null): string {
  if (absPct == null) return colors.textDim
  if (absPct >= 5) return colors.status.err
  if (absPct >= 2) return colors.status.warn
  return colors.status.ok
}

function Metric({
  label,
  value,
  hint,
  color,
}: {
  label: string
  value: string
  hint?: string
  color?: string
}) {
  return (
    <div>
      <div style={{ color: colors.textDim, fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color: color ?? colors.textPrimary, fontSize: 22, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
      {hint && (
        <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{hint}</div>
      )}
    </div>
  )
}

export default function TGNSystemStatePanel({ rows, generatedAt, estByDate }: Props) {
  // Pick the most recent row by Día Operativo.
  const sorted = (rows ?? []).slice().sort((a, b) => rowFecha(a).localeCompare(rowFecha(b)))
  const latest = sorted[sorted.length - 1]
  if (!latest) {
    return (
      <div style={{ ...card, marginTop: space.xl, borderTop: `3px solid ${colors.accent.blue}` }}>
        <h3 style={sectionTitle}>TGN — Estado del sistema</h3>
        <p style={{ color: colors.textDim, fontSize: 13, margin: 0 }}>
          Sin datos disponibles. El scraper corre cada 3 hs.
        </p>
      </div>
    )
  }

  const fecha = rowFecha(latest)
  // Relleno: si ABII no publicó un día posterior (hasta hoy) y hay estimación,
  // se muestra el linepack estimado; los derivados (equilibrio/desbalance/%)
  // quedan en — porque no hay reporte real para inventarlos.
  const today = new Date().toISOString().slice(0, 10)
  const estDatesTgn = [...(estByDate?.keys() ?? [])].filter(f => f > fecha && f <= today).sort()
  const estDate = estDatesTgn[estDatesTgn.length - 1] ?? null
  const estVal = estDate ? (estByDate?.get(estDate) ?? null) : null   // MMm³
  const useEst = estVal != null
  // 'Actual' es el linepack TGN del día (m³); su variación sale de comparar
  // contra la fila previa disponible (espejo del Linepack TGS en TGSPanel).
  const actual = toNumber(latest['Actual'])
  const prev = sorted[sorted.length - 2]
  const prevActual = prev ? toNumber(prev['Actual']) : null
  const varActual = actual != null && prevActual != null ? actual - prevActual : null
  const varHint = varActual != null
    ? `${varActual >= 0 ? '+' : ''}${(varActual / 1_000_000).toFixed(2)} MMm³ vs día anterior`
    : 'Volumen en el sistema'
  const equilibrio = toNumber(latest['Equilibrio'])
  const desbalance = toNumber(latest['Desbalance del sistema'])
  const desbalancePct = toNumber(latest['Desbalance porcentual'])
  // ABII ya publica el desbalance con su signo correcto: POSITIVO cuando el
  // linepack actual está por debajo del equilibrio (déficit), negativo cuando
  // hay superávit. Mostrarlo tal cual viene del reporte — no reinvertir el
  // signo (el pedido del analista: tomar el número como aparece en ABII).
  const deficit = actual != null && equilibrio != null && actual < equilibrio
  const sevColor = severityColor(desbalancePct != null ? Math.abs(desbalancePct) : null)

  const labelFecha = useEst ? estDate : fecha
  const dateLabel = labelFecha
    ? new Date(labelFecha + 'T00:00:00').toLocaleDateString('es-AR', {
        weekday: 'short', day: '2-digit', month: 'short',
      })
    : '—'

  return (
    <div style={{ ...card, marginTop: space.xl, borderTop: `3px solid ${colors.accent.blue}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
        <h3 style={{ ...sectionTitle, margin: 0 }}>TGN — Estado del sistema</h3>
        <div style={{ color: colors.textDim, fontSize: 12 }}>
          Día operativo: <strong style={{ color: colors.textSecondary }}>{dateLabel}</strong>
          {generatedAt && (
            <> · actualizado {new Date(generatedAt).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' })}</>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: space.lg,
          padding: `${space.sm}px 0`,
        }}
      >
        <Metric
          label="Linepack TGN"
          value={useEst ? `${estVal.toFixed(2)} MMm³ (est.)` : fmtMMm3(actual)}
          hint={useEst ? 'Estimado (sin cierre ABII)' : varHint}
        />
        <Metric label="Equilibrio" value={useEst ? '—' : fmtMMm3(equilibrio)} hint="Demanda + extracciones esperadas" />
        <Metric
          label="Desbalance"
          value={useEst ? '—' : fmtMMm3(desbalance != null ? Math.abs(desbalance) : null)}
          hint={useEst ? 'Sin reporte real' : (deficit ? 'Déficit del sistema' : 'Superávit del sistema')}
          color={useEst ? undefined : sevColor}
        />
        <Metric
          label="Desbalance %"
          value={useEst ? '—' : fmtPct(desbalancePct, true)}
          hint="Sobre equilibrio (ABII)"
          color={useEst ? undefined : sevColor}
        />
      </div>

      <div
        style={{
          marginTop: space.md,
          padding: `${space.sm}px ${space.md}px`,
          background: colors.surfaceAlt,
          borderRadius: radius.sm,
          color: colors.textMuted,
          fontSize: 11,
        }}
      >
        Fuente: portal TGN ABII (`pages/reports/system_state`). Se consulta cada 3 h con rango ayer→hoy y todos los gasoductos.
      </div>
    </div>
  )
}
