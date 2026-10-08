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
  useSystemStatus,
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
import { collectDates, demandYDomain, filterDatesByScale, type TimeScale } from '../utils/charts'
import { linepackAlerts } from '../utils/alerts'

function OperacionLoading() {
  return (
    <>
      <SkeletonBlock height={64} style={{ marginBottom: space.lg }} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: space.md,
          marginBottom: space.lg,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} height={100} />
        ))}
      </div>
      <SkeletonBlock height={120} style={{ marginBottom: space.lg }} />
      <ChartSkeleton height={360} />
    </>
  )
}

export default function OperacionPage() {
  const dailyState = useDaily()
  const injectionsDailyState = useInjectionsDaily()
  const commentsState = useComments()
  const weatherState = useWeather()
  const weatherHistoryState = useWeatherHistory()
  const forecastState = useDemandForecast()
  const regionsState = useWeatherRegions()
  const rdsState = useEnargasRDS()
  const psState = useEnargasPS()
  const etgsState = useETGS()
  const smnState = useSMNAlerts()
  const megsaState = useMEGSA()
  const ppoState = useCammesaPPO()
  const tgnSystemState = useTGNSystemState()
  const linepackFcState = useLinepackForecast()
  const systemStatusState = useSystemStatus() // <-- Agregado

  const [selectedCity, setSelectedCity] = useState('ba')
  const [scale, setScale] = useState<TimeScale>('7d')

  const weatherForecast = weatherState.data?.forecast ?? []
  const weatherHistoryData = weatherHistoryState.data
  const demandFc = forecastState.data

  const data = useMemo(() => dailyState.data ?? [], [dailyState.data])
  const valid = useMemo(() => data.filter((d) => d.demanda_total != null), [data])
  
  const injectionsData = useMemo(() => injectionsDailyState.data ?? [], [injectionsDailyState.data])

  const allDates = useMemo(
    () => collectDates(data, demandFc?.forecast ?? [], weatherForecast),
    [data, demandFc, weatherForecast],
  )
  const visibleDates = useMemo(() => filterDatesByScale(allDates, scale), [allDates, scale])
  const demandY = useMemo(
    () => demandYDomain(valid, demandFc?.forecast ?? []),
    [valid, demandFc],
  )

  const linepackForecast = useMemo(() => linepackFcState.data?.forecast ?? [], [linepackFcState.data])
  const tgnEstByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of linepackForecast) if (f.linepack_tgn_est != null) m.set(f.fecha, f.linepack_tgn_est)
    return m
  }, [linepackForecast])
  const tgsEstByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of linepackForecast) if (f.linepack_tgs_est != null) m.set(f.fecha, f.linepack_tgs_est)
    return m
  }, [linepackForecast])

  if (dailyState.loading) return <OperacionLoading />

  if (dailyState.error) {
    return (
      <div style={{ ...card, color: colors.status.err }}>
        No se pudo cargar daily.json: {dailyState.error.message}
      </div>
    )
  }

  const latest = valid[valid.length - 1]
  const comments = commentsState.data ?? { daily: [], weekly: [] }
  const regions = regionsState.data ?? []
  const rdsReports = rdsState.data ?? []

  const freshness = [
    { label: 'Base', generatedAt: dailyState.meta.generated_at },
    { label: 'Clima', generatedAt: weatherState.meta.generated_at },
    { label: 'Hist. Clima', generatedAt: weatherHistoryState.meta.generated_at },
    { label: 'ENARGAS', generatedAt: rdsState.meta.generated_at },
    { label: 'Proy. ENARGAS', generatedAt: psState.meta.generated_at },
    { label: 'MEGSA', generatedAt: megsaState.meta.generated_at },
    { label: 'TGN', generatedAt: tgnSystemState.meta.generated_at },
    { label: 'Forecast', generatedAt: forecastState.meta.generated_at },
    { label: 'Proy. linepack', generatedAt: linepackFcState.meta.generated_at },
    { label: 'Estado Sistema', generatedAt: systemStatusState.meta.generated_at },
  ]

  return (
    <>
      <Header lastDate={latest?.fecha} freshness={freshness} />
      <AlertBanner alerts={linepackAlerts(latest)} />
      <TomorrowCard />
      {smnState.data && smnState.data.length > 0 && (
        <div style={{
          marginTop: space.md,
          background: colors.status.err + '22',
          border: `1px solid ${colors.status.err}`,
          borderRadius: radius.md,
          padding: `${space.sm}px ${space.lg}px`,
          color: colors.status.err,
          fontSize: 13,
          fontWeight: 600,
        }}>
          ⚠ {smnState.data.length} alerta{smnState.data.length === 1 ? '' : 's'} meteorológica{smnState.data.length === 1 ? '' : 's'} activa{smnState.data.length === 1 ? '' : 's'} del SMN — ver pestaña Fuentes para detalle.
        </div>
      )}
      <KPICards latest={latest} />

      <PulseCard 
        rows={rdsReports as never} 
        systemStatus={systemStatusState.data} // <-- Pasado al componente
      />

      <div style={{ ...card, marginTop: space.xl }}>
        <CommentsSection comments={comments} />
      </div>

      {rdsReports.length > 0 && (
        <div style={{ ...card, marginTop: space.xl }}>
          <SystemFlowPanel latest={rdsReports[rdsReports.length - 1] as never} generatedAt={rdsState.meta.generated_at} />
        </div>
      )}

      <TGSPanel estByDate={tgsEstByDate} />

      <TGNSystemStatePanel
        rows={tgnSystemState.data}
        generatedAt={tgnSystemState.meta.generated_at}
        estByDate={tgnEstByDate}
      />

      {megsaState.data && megsaState.data.benchmarks?.length > 0 && (
        <div style={{ ...card, marginTop: space.xl, borderTop: `3px solid ${colors.accent.green}` }}>
          <MEGSAPanel data={megsaState.data} />
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: space.lg,
          marginTop: space.xl,
        }}
      >
        <SystemPanel
          title="Sistema TGS"
          color={colors.accent.green}
          data={valid}
          linepackKey="linepack_tgs"
          varKey="var_linepack_tgs"
          limInfKey="lim_inf_tgs"
          limSupKey="lim_sup_tgs"
          estadoKey="estado"
          estByDate={tgsEstByDate}
        />
        <SystemPanel
          title="Sistema TGN"
          color={colors.accent.blue}
          data={valid}
          linepackKey="linepack_tgn"
          varKey="var_linepack_tgn"
          limInfKey="lim_inf_tgn"
          limSupKey="lim_sup_tgn"
          estadoKey="estado_tgn"
          estByDate={tgnEstByDate}
        />
        <div style={{ ...card, borderTop: `3px solid ${colors.accent.orange}` }}>
          <WeeklyComparison data={valid} />
        </div>
        {regions.length > 0 && (
          <div style={{ ...card, borderTop: `3px solid ${colors.accent.purple}` }}>
            <ColdRanking cities={regions} />
          </div>
        )}
      </div>

      <ScaleSelector
        value={scale}
        onChange={setScale}
        options={[
          { id: '7d', label: '7d + forecast' },
          { id: '30d', label: '30d + forecast' },
          { id: '90d', label: '90d' },
        ]}
      />

      <ChartGroup title="Drivers — clima y generación eléctrica">
        <div style={card}>
          <h3 style={sectionTitle}>Temperatura (real + forecast)</h3>
          <TemperatureChart
            data={valid}
            historyData={weatherHistoryData}
            forecast={weatherForecast}
            regions={regions}
            selectedCityId={selectedCity}
            onSelectCity={setSelectedCity}
            allDates={visibleDates}
          />
        </div>
        <div style={card}>
          <h3 style={sectionTitle}>Despacho eléctrico — Combustibles</h3>
          <FuelMixChart
            data={data}
            ppoRows={ppoState.data ?? []}
            demandForecast={demandFc?.forecast ?? []}
            allDates={visibleDates}
          />
        </div>
      </ChartGroup>

      <ChartGroup title="Demanda de gas">
        {demandFc && demandFc.forecast.length > 0 && (
          <div style={card}>
            <h3 style={sectionTitle}>Forecast de demanda (real + estimada)</h3>
            <DemandForecastChart
              data={valid}
              forecast={demandFc.forecast}
              allDates={visibleDates}
              yDomain={demandY}
            />
          </div>
        )}
        <div style={card}>
          <h3 style={sectionTitle}>Demanda por sector (MMm³/día)</h3>
          <DemandChart
            data={valid}
            forecast={demandFc?.forecast ?? []}
            exportacionesBaseline={demandFc?.regression.baseline_exportaciones ?? undefined}
            allDates={visibleDates}
            yDomain={demandY}
          />
        </div>
      </ChartGroup>

      <ChartGroup title="Oferta + estado del sistema">
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
            <p style={{ color: colors.textDim, fontSize: 11, marginTop: 8 }}>
              Volumen programado de regasificación en Escobar. Fuente: ENARGAS RDS diario.
              Línea punteada: proyección que sostiene el último programa (~7 d); los cargamentos
              futuros pueden variar. Cargamentos estacionales — concentrados en invierno (mayo-agosto).
            </p>
          </div>
        )}
      </ChartGroup>
    </>
  )
}
