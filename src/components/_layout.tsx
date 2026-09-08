import { colors, radius, space } from '../theme'
import type { TimeScale } from '../utils/charts'

export function ScaleSelector({
  value,
  onChange,
  options,
}: {
  value: TimeScale
  onChange: (v: TimeScale) => void
  options?: { id: TimeScale; label: string }[]
}) {
  const opts = options ?? [
    { id: '7d', label: '7d + forecast' },
    { id: '30d', label: '30d + forecast' },
    { id: '90d', label: '90d' },
    { id: 'all', label: 'Todo' },
  ]
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        marginTop: space.xl,
        padding: 4,
        background: colors.surface,
        borderRadius: radius.md,
        width: 'fit-content',
      }}
    >
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            background: value === o.id ? colors.border : 'transparent',
            color: value === o.id ? colors.textPrimary : colors.textDim,
            border: 'none',
            borderRadius: radius.sm,
            padding: `${space.xs + 2}px ${space.md}px`,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ChartGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: space.xl }}>
      <h2
        style={{
          color: colors.textMuted,
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          marginBottom: space.md,
          paddingLeft: space.xs,
          borderLeft: `3px solid ${colors.accent.blue}`,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))',
          gap: space.lg,
        }}
      >
        {children}
      </div>
    </section>
  )
}
