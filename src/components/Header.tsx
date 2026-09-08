import { colors, radius, space } from '../theme'
import FreshnessBadge from './FreshnessBadge'

interface FreshnessItem {
  label: string
  generatedAt: string | null
}

interface Props {
  lastDate?: string
  freshness?: FreshnessItem[]
}

export default function Header({ lastDate, freshness = [] }: Props) {
  const formatted = lastDate
    ? new Date(lastDate + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '...'

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: space.md,
        marginBottom: space.md,
      }}
    >
      <div>
        <h1 style={{ fontSize: 'clamp(20px, 3.5vw, 28px)', fontWeight: 700, color: colors.textPrimary }}>
          Estado del Sistema
        </h1>
        <p style={{ color: colors.textDim, fontSize: 14, marginTop: 4 }}>
          Red de transporte de gas - Argentina
        </p>
      </div>
      <div style={{ textAlign: 'right', minWidth: 0 }}>
        <button
          onClick={() => window.location.reload()}
          title="Recargar para traer la última actualización publicada (cada 3 h)"
          style={{
            background: colors.surfaceAlt,
            color: colors.textSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 6,
          }}
        >
          ↻ Actualizar
        </button>
        <p style={{ color: colors.textDim, fontSize: 12 }}>Ultimo dato</p>
        <p style={{ color: colors.textSecondary, fontSize: 14, fontWeight: 600 }}>{formatted}</p>
        {freshness.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
            {freshness.map((f) => (
              <FreshnessBadge key={f.label} label={f.label} generatedAt={f.generatedAt} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
