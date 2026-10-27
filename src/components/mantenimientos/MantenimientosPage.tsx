import { useMemo } from 'react'
import { useMantenimientos } from '../../hooks/useData'
import { card, colors, sectionTitle, space } from '../../theme'
import type { MantenimientosData } from '../../types'
import { ChartSkeleton, SkeletonBlock } from '../Skeleton'
import { MantenimientosKpis } from './MantenimientosKpis'
import { MantenimientosTable } from './MantenimientosTable'
import { MantenimientosTimeline } from './MantenimientosTimeline'
import { hoyISO } from './utils'

interface ViewProps {
  data: MantenimientosData
  hoy: string
  sourceDate?: string | null
}

// Pure view (no data fetching): easy to reuse and to test with a fixture.
export function MantenimientosView({ data, hoy, sourceDate }: ViewProps) {
  return (
    <>
      <p style={{ margin: `0 0 ${space.lg}px`, fontSize: 13, color: colors.textDim }}>
        Programa de mantenimientos informado en el Excel del CCO
        {sourceDate ? ` · archivo del ${sourceDate.slice(8, 10)}/${sourceDate.slice(5, 7)}/${sourceDate.slice(0, 4)}` : ''}.
        Los impactos están en {data.metadata.unidad.replace('m3', 'm³')}; los negativos reducen la capacidad.
      </p>

      <MantenimientosKpis filas={data.tabla} impactoDiario={data.impacto_diario} hoy={hoy} />

      <div style={{ ...card, marginTop: space.xl }}>
        <h3 style={sectionTitle}>Calendario de mantenimientos</h3>
        <MantenimientosTimeline filas={data.tabla} hoy={hoy} />
      </div>

      <div style={{ ...card, marginTop: space.xl }}>
        <h3 style={sectionTitle}>Detalle por mantenimiento</h3>
        <MantenimientosTable filas={data.tabla} hoy={hoy} />
      </div>

      {data.advertencias.length > 0 && (
        <details style={{ marginTop: space.xl, fontSize: 13, color: colors.textDim }}>
          <summary style={{ cursor: 'pointer' }}>Avisos del Excel ({data.advertencias.length})</summary>
          <ul>
            {data.advertencias.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

export default function MantenimientosPage() {
  const { data, loading, error, meta } = useMantenimientos()
  // Hooks stay above any early return (rules of hooks).
  const hoy = useMemo(() => hoyISO(), [])

  if (loading) {
    return (
      <>
        <SkeletonBlock height={64} style={{ marginBottom: space.lg }} />
        <ChartSkeleton height={260} />
      </>
    )
  }

  if (error || !data) {
    return (
      <div style={{ ...card, color: colors.status.err }}>
        No se pudo cargar mantenimientos.json{error ? `: ${error.message}` : ''}
      </div>
    )
  }

  return <MantenimientosView data={data} hoy={hoy} sourceDate={meta.source_date} />
}
