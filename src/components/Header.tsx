import { colors, radius, space } from '../theme'
import FreshnessBadge from './FreshnessBadge'

interface FreshnessItem {
  label: string
  generatedAt: string | null
}

interface Props {
  title?: string
  lastDate?: string
  freshness?: FreshnessItem[]
}

export default function Header({ title = 'Reporte Estado del Sistema', freshness = [] }: Props) {
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
          {title}
        </h1>
        <p style={{ color: colors.textDim, fontSize: 14, marginTop: 4 }}>
          Red de transporte de gas - Argentina
        </p>
      </div>
      <div style={{ textAlign: 'right', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
          <button
            onClick={() => window.print()}
            title="Exportar o imprimir la pantalla en PDF"
            style={{
              background: colors.surfaceAlt,
              color: colors.textSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🖨 Imprimir PDF
          </button>
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
            }}
          >
            ↻ Actualizar
          </button>
        </div>
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
