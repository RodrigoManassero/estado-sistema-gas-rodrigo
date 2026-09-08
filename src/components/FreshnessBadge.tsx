import { badge } from '../theme'

interface Props {
  label: string
  generatedAt: string | null
  warnHours?: number
  staleHours?: number
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${Math.round(hours)} h`
  return `${Math.round(hours / 24)} d`
}

export default function FreshnessBadge({ label, generatedAt, warnHours = 30, staleHours = 48 }: Props) {
  if (!generatedAt) {
    return <span style={badge('#64748b')}>{label}: sin dato</span>
  }

  const ageMs = Date.now() - new Date(generatedAt).getTime()
  const hours = ageMs / 3_600_000

  const color = hours > staleHours ? '#ef4444' : hours > warnHours ? '#f59e0b' : '#10b981'
  const suffix = hours > staleHours ? 'stale' : 'ok'

  return (
    <span style={badge(color)} title={new Date(generatedAt).toLocaleString('es-AR')}>
      {label}: {formatAge(hours)} ({suffix})
    </span>
  )
}
