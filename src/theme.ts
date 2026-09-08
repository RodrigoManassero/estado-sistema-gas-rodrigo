// Design tokens for the dashboard. Keep values here and reference them from
// component style objects so the palette and spacing stay consistent.

export const colors = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#0f172a',
  border: '#334155',
  textPrimary: '#f1f5f9',
  textSecondary: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  accent: {
    blue: '#3b82f6',
    green: '#10b981',
    orange: '#f59e0b',
    red: '#ef4444',
    purple: '#8b5cf6',
    gray: '#6b7280',
  },
  status: {
    ok: '#10b981',
    warn: '#f59e0b',
    err: '#ef4444',
    muted: '#64748b',
  },
} as const

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  pill: 20,
} as const

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 32,
} as const

// Shared style primitives reused by many panels.
export const card: React.CSSProperties = {
  background: colors.surface,
  borderRadius: radius.lg,
  padding: space.xl,
  border: `1px solid ${colors.border}`,
}

export const sectionTitle: React.CSSProperties = {
  marginBottom: space.md,
  color: colors.textMuted,
  fontSize: 14,
  textTransform: 'uppercase',
  letterSpacing: 1,
}

export const badge = (color: string): React.CSSProperties => ({
  background: color + '22',
  color,
  padding: '2px 10px',
  borderRadius: radius.pill,
  fontSize: 11,
  fontWeight: 700,
})

// Square icon button used by the map zoom controls (＋ － ⟲). Shared so both
// SVG maps render identical controls.
export const iconBtn: React.CSSProperties = {
  background: colors.surface,
  color: colors.textPrimary,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  width: 28,
  height: 28,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}
