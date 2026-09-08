import { colors, sectionTitle, space } from '../theme'
import type { MEGSABenchmark, MEGSAPayload } from '../hooks/useData'

interface Props {
  data: MEGSAPayload
}

function arrow(diff: number | null | undefined): { label: string; color: string } {
  if (diff == null || diff === 0) return { label: '–', color: colors.textDim }
  if (diff > 0) return { label: '▲', color: colors.status.ok }
  return { label: '▼', color: colors.status.err }
}

function BenchmarkCard({ b }: { b: MEGSABenchmark }) {
  const a = arrow(b.nominalDifference)
  return (
    <div style={{
      padding: `${space.sm}px ${space.md}px`,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      background: colors.surfaceAlt,
      minWidth: 0,
    }}>
      <div style={{ color: colors.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {b.displayName}
      </div>
      <div style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginTop: 2 }}>
        {b.currentPrice.toFixed(2)}
        <span style={{ color: colors.textDim, fontSize: 11, fontWeight: 400, marginLeft: 4 }}>
          {b.units}
        </span>
      </div>
      <div style={{ color: a.color, fontSize: 12, fontWeight: 600, marginTop: 2 }}>
        {a.label} {b.nominalDifference != null ? `${b.nominalDifference >= 0 ? '+' : ''}${b.nominalDifference.toFixed(2)}` : '—'}
        {b.percentageDifference != null && (
          <span style={{ color: colors.textDim, fontWeight: 400, marginLeft: 4 }}>
            ({b.percentageDifference >= 0 ? '+' : ''}{b.percentageDifference.toFixed(2)}%)
          </span>
        )}
      </div>
    </div>
  )
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (isNaN(dt.getTime())) return iso
  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  return `${days[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}`
}

export default function MEGSAPanel({ data }: Props) {
  const benchmarks = data.benchmarks ?? []
  const dolar = data.dolar
  const rondas = data.rondas ?? []

  return (
    <div>
      <h3 style={sectionTitle}>
        MEGSA — benchmarks y mercado
        <span style={{ float: 'right', fontSize: 11, color: colors.textDim, textTransform: 'none' }}>
          Precios spot internacionales + USD/ARS + rondas publicadas
        </span>
      </h3>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: space.sm,
        marginBottom: space.md,
      }}>
        {benchmarks.map((b) => <BenchmarkCard key={b.product} b={b} />)}
        {dolar?.currentPrice != null && (
          <div style={{
            padding: `${space.sm}px ${space.md}px`,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            background: colors.surfaceAlt,
          }}>
            <div style={{ color: colors.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>USD</div>
            <div style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              ${dolar.currentPrice.toFixed(0)}
              <span style={{ color: colors.textDim, fontSize: 11, fontWeight: 400, marginLeft: 4 }}>ARS</span>
            </div>
            <div style={{ color: arrow(dolar.percentageDifference).color, fontSize: 12, fontWeight: 600, marginTop: 2 }}>
              {arrow(dolar.percentageDifference).label}{' '}
              {dolar.percentageDifference != null ? `${dolar.percentageDifference >= 0 ? '+' : ''}${dolar.percentageDifference.toFixed(2)}%` : '—'}
            </div>
          </div>
        )}
      </div>

      {rondas.length > 0 && (
        <div>
          <h4 style={{ color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.xs, fontWeight: 600 }}>
            Próximas rondas de negociación
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
            {rondas.slice(0, 3).map((r) => (
              <div key={r.id} style={{
                padding: `${space.xs + 2}px ${space.md}px`,
                background: colors.surfaceAlt,
                borderLeft: `2px solid ${colors.accent.blue}`,
                borderRadius: 4,
                fontSize: 12,
                color: colors.textSecondary,
                whiteSpace: 'pre-wrap',
                lineHeight: 1.4,
              }}>
                <div style={{ color: colors.textDim, fontSize: 10 }}>Publicada {fmtDate(r.publicaDesde)}</div>
                {r.descripcion}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
