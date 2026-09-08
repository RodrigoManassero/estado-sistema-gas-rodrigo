import { colors, radius } from '../theme'

interface Props {
  height?: number | string
  width?: number | string
  style?: React.CSSProperties
}

export function SkeletonBlock({ height = 200, width = '100%', style }: Props) {
  return (
    <div
      style={{
        height,
        width,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div className="skeleton-shimmer" />
    </div>
  )
}

export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return <SkeletonBlock height={height} />
}
