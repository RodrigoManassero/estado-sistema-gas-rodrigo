import { useEnargasRDS } from '../hooks/useData'
import { card, colors, sectionTitle, space } from '../theme'
import HistoricalBandChart from './HistoricalBandChart'
import YearOverYearChart from './YearOverYearChart'
import { ChartGroup } from './_layout'
import { ChartSkeleton } from './Skeleton'

// Long-horizon view: year-over-year comparisons and historical bands. Needs
// at least ~60 days of RDS data to draw meaningful seasonality charts.
export default function HistoricoPage() {
  const rdsState = useEnargasRDS()

  if (rdsState.loading) {
    return <ChartSkeleton height={420} />
  }

  const rdsReports = rdsState.data ?? []

  if (rdsReports.length < 60) {
    return (
      <div style={{ ...card, color: colors.textDim, textAlign: 'center', padding: space.xl * 2 }}>
        <h2 style={{ color: colors.textPrimary, fontSize: 18, marginBottom: space.md }}>
          Histórico no disponible aún
        </h2>
        Se necesitan al menos 60 días de reportes ENARGAS RDS para dibujar las comparaciones estacionales.
        <br />
        Actualmente: {rdsReports.length} días. Corré <code>scripts/backfill_enargas.py --days 365</code> para
        sembrar el histórico.
      </div>
    )
  }

  return (
    <>
      <h1 style={{ color: colors.textPrimary, fontSize: 24, fontWeight: 700, marginBottom: space.sm }}>
        Análisis estacional
      </h1>
      <p style={{ color: colors.textDim, fontSize: 13, marginBottom: space.xl }}>
        Año actual contra años previos: linepack del sistema y consumo total. La banda gris marca el
        rango histórico (mínimo y máximo por día del año); la línea azul es 2026.
      </p>

      <ChartGroup title="Linepack — sistema completo">
        <div style={card}>
          <h3 style={sectionTitle}>Linepack — año actual vs rango histórico</h3>
          <HistoricalBandChart rows={rdsReports as never} field="linepack_total" unit="MMm³" />
          <p style={{ color: colors.textDim, fontSize: 11, marginTop: 8 }}>
            Banda gris = min/max histórico por día del año. Línea azul = 2026. Si la línea
            sale del rango es una anomalía vs los años previos.
          </p>
        </div>
        <div style={card}>
          <h3 style={sectionTitle}>Linepack — años superpuestos</h3>
          <YearOverYearChart rows={rdsReports as never} field="linepack_total" unit="MMm³" />
          <p style={{ color: colors.textDim, fontSize: 11, marginTop: 8 }}>
            Año actual con línea gruesa; años previos tenues para ver el patrón estacional.
          </p>
        </div>
      </ChartGroup>

      <ChartGroup title="Consumo del sistema">
        <div style={card}>
          <h3 style={sectionTitle}>Consumo total — año actual vs rango histórico</h3>
          <HistoricalBandChart rows={rdsReports as never} field="consumo_total_estimado" unit="MMm³/d" />
          <p style={{ color: colors.textDim, fontSize: 11, marginTop: 8 }}>
            Programa de consumo diario publicado por ENARGAS (planificado, no realizado).
          </p>
        </div>
        <div style={card}>
          <h3 style={sectionTitle}>Consumo total — años superpuestos</h3>
          <YearOverYearChart rows={rdsReports as never} field="consumo_total_estimado" unit="MMm³/d" />
        </div>
      </ChartGroup>
    </>
  )
}
