import { colors, radius, space } from '../theme'
import type { Alert } from '../utils/alerts'

const styleByLevel: Record<Alert['level'], { bg: string; fg: string }> = {
  info: { bg: colors.accent.blue + '22', fg: colors.accent.blue },
  warn: { bg: colors.accent.orange + '22', fg: colors.accent.orange },
  err: { bg: colors.status.err + '22', fg: colors.status.err },
}

export default function AlertBanner({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: space.xs, marginTop: space.md }}>
      {alerts.map((a, i) => {
        const s = styleByLevel[a.level]
        return (
          <div
            key={i}
            style={{
              background: s.bg,
              border: `1px solid ${s.fg}`,
              borderRadius: radius.md,
              padding: `${space.sm}px ${space.lg}px`,
              color: s.fg,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {a.level === 'err' ? '⛔' : a.level === 'warn' ? '⚠' : 'ℹ'} {a.message}
          </div>
        )
      })}
    </div>
  )
}
