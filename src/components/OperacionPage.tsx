import { useMemo, useState } from 'react'
import {
  useDaily,
  useInjectionsDaily,
  useComments,
  useWeather,
  useWeatherHistory,
  useDemandForecast,
  useWeatherRegions,
  useEnargasRDS,
  useEnargasPS,
  useETGS,
  useSMNAlerts,
  useMEGSA,
  useCammesaPPO,
  useTGNSystemState,
  useLinepackForecast,
  useSystemStatus, // 1. Importado
} from '../hooks/useData'
import { card, colors, radius, sectionTitle, space } from '../theme'
import Header from './Header'
import KPICards from './KPICards'
import SystemPanel from './SystemPanel'
import DemandChart from './DemandChart'
import DemandForecastChart from './DemandForecastChart'
import LinepackChart from './LinepackChart'
import TemperatureChart from './TemperatureChart'
import FuelMixChart from './FuelMixChart'
import InjectionsChart from './InjectionsChart'
import WeeklyComparison from './WeeklyComparison'
import CommentsSection from './CommentsSection'
import ColdRanking from './ColdRanking'
import MEGSAPanel from './MEGSAPanel'
import SystemFlowPanel from './SystemFlowPanel'
import PulseCard from './PulseCard'
import LNGArrivalsChart from './LNGArrivalsChart'
import TomorrowCard from './TomorrowCard'
import AlertBanner from './AlertBanner'
import TGSPanel from './TGSPanel'
import TGNSystemStatePanel from './TGNSystemStatePanel'
import { ChartSkeleton, SkeletonBlock } from './Skeleton'
import { ChartGroup, ScaleSelector } from './_layout'
import { collectDates, demandYDomain, filterDates, mergeTimeSeries } from './_utils'
import type { DailyRow } from '../types'

export default function OperacionPage() {
  const dailyState = useDaily()
  const injectionsState = useInjectionsDaily()
  const commentsState = useComments()
  const weatherState = useWeather()
  const weatherHistoryState = useWeatherHistory()
  const demandFcState = useDemandForecast()
  const weatherRegionsState = useWeatherRegions()
  const rdsState = useEnargasRDS()
  const psState = useEnargasPS()
  const etgsState = useETGS()
  const smnAlertsState = useSMNAlerts()
  const megsaState = useMEGSA()
  const cammesaPpoState = useCammesaPPO()
  const tgnSystemState = useTGNSystemState()
  const linepackFcState = useLinepackForecast()
  const systemStatusState = useSystemStatus() // 2. Invocado

  const [scale, setScale] = useState<'30d' | '90d' | 'ytd' | 'all'>('30d')

  const dailyRows = dailyState.data ?? []
  const injectionsRows = injectionsState.data ?? []
  const weatherRows = weatherState.data?.days ?? []
  const weatherHistoryRows = weatherHistoryState.data?.days ?? []
  const demandFc = demandFcState.data
  const rdsReports = rdsState.data ?? []
  const linepackForecast = linepackFcState.data?.forecast ?? []

  const combinedWeather = useMemo(() => {
    const map = new Map<string, any>()
    for (const d of weatherHistoryRows) if (d.fecha) map.set(d.fecha, d)
    for (const d of weatherRows) if (d.fecha) map.set(d.fecha, d)
    return Array.from(map.values()).sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''))
  }, [weatherHistoryRows, weatherRows])

  const unified = useMemo(() => {
    return mergeTimeSeries(dailyRows, combinedWeather, injectionsRows)
  }, [dailyRows, combinedWeather, injectionsRows])

  const allDates = useMemo(() => collectDates(unified), [unified])
  const visibleDates = useMemo(() => filterDates(allDates, scale), [allDates, scale])
  const valid = useMemo(() => unified.filter((d) => visibleDates.includes(d.fecha ?? '')), [unified, visibleDates])
  const latest = valid[valid.length - 1] ?? dailyRows[dailyRows.length - 1]

  const demandY = useMemo(() => demandYDomain(valid), [valid])

  const injectionsData = useMemo(() => {
    return valid.map((d) => ({
      fecha: d.fecha,
      gn_cammesa: d.gn_cammesa ?? null,
      gn_distribuidoras: d.gn_distribuidoras ?? null,
      gn_industrias: d.gn_industrias ?? null,
      gn_gnc: d.gn_gnc ?? null,
      gn_otros: d.gn_otros ?? null,
    }))
  }, [valid])

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: space.xl, color: colors.textPrimary }}>
      <Header />

      <AlertBanner alerts={smnAlertsState.data ?? []} />

      {rdsReports.length > 0 && (
        <PulseCard 
          rows={rdsReports as never} 
          systemStatus={systemStatusState.data} // 3. Pasado por prop
        />
      )}

      <KPICards latest={latest} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: space.lg, marginBottom: space.sm }}>
        <ScaleSelector current={scale} onChange={scale => setScale(scale)} />
      </div>

      <ChartGroup title=\"Demanda y Temperatura\">
        <div style={card}>
          <h3 style={sectionTitle}>Demanda Total de Gas (MMm³/día) y Componentes</h3>
          <DemandChart data={valid} allDates={visibleDates} yDomain={demandY} />
        </div>
        <div style={card}>
          <h3 style={sectionTitle}>Pronóstico de Demanda (T+1 / T+6)</h3>
          <DemandForecastChart
            forecast={demandFc?.forecast ?? []}
            exportacionesBaseline={demandFc?.regression.baseline_exportaciones ?? undefined}
            allDates={visibleDates}
            yDomain={demandY}
          />
        </div>
      </ChartGroup>

      <ChartGroup title=\"Oferta + estado del sistema\">
        <div style={card}>
          <h3 style={sectionTitle}>Inyecciones por fuente (MMm³/día)</h3>
          <InjectionsChart data={injectionsData} allDates={visibleDates} />
        </div>
        <div style={card}>
          <h3 style={sectionTitle}>Linepack TGS + TGN (MMm³)</h3>
          <LinepackChart
            data={valid}
            etgsRows={etgsState.data ?? []}
            tgnRows={tgnSystemState.data ?? []}
            forecast={linepackForecast}
            allDates={visibleDates}
          />
        </div>
        {rdsReports.length > 0 && (
          <div style={card}>
            <h3 style={sectionTitle}>Próximos barcos GNL (MMm³/día programados)</h3>
            <LNGArrivalsChart rows={rdsReports as never} />
          </div>
        )}
      </ChartGroup>
    </div>
  )
}
