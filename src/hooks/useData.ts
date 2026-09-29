import { useEffect, useState } from 'react'
import type {
  Comments,
  DailyRow,
  DemandForecast,
  EnargasINGRow,
  EnargasRDSRow,
  Envelope,
  ETGSRow,
  FetchState,
  LinepackForecast,
  RegionCity,
  WeatherPayload,
} from '../types'

export type { ForecastDay, DemandForecastDay, DemandForecast } from '../types'

export interface EnargasPSRow {
  fecha?: string | null
  'Día Operativo'?: string | null
  iny_tgs?: number | null
  iny_tgn?: number | null
  iny_enarsa?: number | null
  iny_gpm?: number | null
  iny_bolivia?: number | null
  iny_escobar?: number | null
  [key: string]: unknown
}

export function useJson<T>(path: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
    meta: { generated_at: null, source: null, source_date: null },
  })

  useEffect(() => {
    let cancelled = false
    fetch(path, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${path}`)
        return r.json()
      })
      .then((raw: unknown) => {
        if (cancelled) return
        if (raw && typeof raw === 'object' && 'data' in raw && 'generated_at' in raw) {
          const env = raw as Envelope<T>
          setState({
            data: env.data,
            loading: false,
            error: null,
            meta: {
              generated_at: env.generated_at ?? null,
              source: env.source ?? null,
              source_date: env.source_date ?? null,
            },
          })
        } else {
          setState({
            data: raw as T,
            loading: false,
            error: null,
            meta: { generated_at: null, source: null, source_date: null },
          })
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err }))
      })
    return () => {
      cancelled = true
    }
  }, [path])

  return state
}

/**
 * Procesa las inyecciones tomando como ÚNICA FUENTE DE VERDAD histórica a enargas_ps.json.
 * Recorta la historia a los últimos 30 días para evitar franjas horizontales gigantes a la izquierda.
 */
export function processInjectionsFromPS(
  dailyRows: DailyRow[],
  psRows: EnargasPSRow[] | null
): DailyRow[] {
  if (!dailyRows || dailyRows.length === 0) return []

  // 0. RECORTE HISTÓRICO: Tomamos solo los últimos 30 días
  const recentDailyRows = dailyRows.slice(-30)

  const psMap = new Map<string, EnargasPSRow>()
  if (psRows && Array.isArray(psRows)) {
    psRows.forEach((ps) => {
      const fechaKey = ps.fecha || ps['Día Operativo']
      if (fechaKey) {
        psMap.set(String(fechaKey).trim(), ps)
      }
    })
  }

  const isValidPSRow = (ps: EnargasPSRow) => {
    const tgs = Number(ps.iny_tgs || 0)
    const tgn = Number(ps.iny_tgn || 0)
    const enarsa = Number(ps.iny_enarsa || ps.iny_gpm || 0)
    return tgs + tgn + enarsa > 10
  }

  const validPSHistorical = (psRows || []).filter(isValidPSRow).slice(-3)

  let avgTGS = 0,
    avgTGN = 0,
    avgENARSA = 0,
    avgBolivia = 0,
    avgEscobar = 0

  if (validPSHistorical.length > 0) {
    const count = validPSHistorical.length

    interface IngestionAccumulator {
      tgs: number
      tgn: number
      enarsa: number
      bolivia: number
      escobar: number
    }

    const initialAcc: IngestionAccumulator = {
      tgs: 0,
      tgn: 0,
      enarsa: 0,
      bolivia: 0,
      escobar: 0,
    }

    const sum = validPSHistorical.reduce<IngestionAccumulator>(
      (acc, r) => ({
        tgs: acc.tgs + Number(r.iny_tgs || 0),
        tgn: acc.tgn + Number(r.iny_tgn || 0),
        enarsa: acc.enarsa + Number(r.iny_enarsa || r.iny_gpm || 0),
        bolivia: acc.bolivia + Number(r.iny_bolivia || 0),
        escobar: acc.escobar + Number(r.iny_escobar || 0),
      }),
      initialAcc
    )

    avgTGS = Number((sum.tgs / count).toFixed(2))
    avgTGN = Number((sum.tgn / count).toFixed(2))
    avgENARSA = Number((sum.enarsa / count).toFixed(2))
    avgBolivia = Number((sum.bolivia / count).toFixed(2))
    avgEscobar = Number((sum.escobar / count).toFixed(2))
  }

  // 1. Mapeo sobre los datos recientes
  const result: any[] = recentDailyRows.map((row) => {
    const psData = psMap.get(String(row.fecha).trim())
    const hasRealInjection = psData ? isValidPSRow(psData) : false

    if (hasRealInjection && psData) {
      const tgs = Number(psData.iny_tgs || 0)
      const tgn = Number(psData.iny_tgn || 0)
      const enarsa = Number(psData.iny_enarsa || psData.iny_gpm || 0)
      const bolivia = Number(psData.iny_bolivia || 0)
      const escobar = Number(psData.iny_escobar || 0)
      const total = Number((tgs + tgn + enarsa + bolivia + escobar).toFixed(2))

      return {
        ...row,
        isForecast: false,
        iny_tgs: tgs,
        iny_tgn: tgn,
        iny_enarsa: enarsa,
        iny_bolivia: bolivia,
        iny_escobar: escobar,
        iny_total: total,
      }
    }

    const totalEst = Number((avgTGS + avgTGN + avgENARSA + avgBolivia + avgEscobar).toFixed(2))

    return {
      ...row,
      isForecast: true,
      iny_tgs: avgTGS,
      iny_tgn: avgTGN,
      iny_enarsa: avgENARSA,
      iny_bolivia: avgBolivia,
      iny_escobar: avgEscobar,
      iny_total: totalEst,
    }
  })

  // 2. Extensión dinámica de fechas futuras si faltan días para el horizonte de 21 días
  const TARGET_HORIZON_DAYS = 21
  if (result.length > 0 && result.length < TARGET_HORIZON_DAYS) {
    let lastDateStr = result[result.length - 1].fecha
    const totalEst = Number((avgTGS + avgTGN + avgENARSA + avgBolivia + avgEscobar).toFixed(2))

    while (result.length < TARGET_HORIZON_DAYS) {
      const parts = lastDateStr.split('-').map(Number)
      const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
      d.setUTCDate(d.getUTCDate() + 1)
      lastDateStr = d.toISOString().split('T')[0]

      result.push({
        fecha: lastDateStr,
        isForecast: true,
        iny_tgs: avgTGS,
        iny_tgn: avgTGN,
        iny_enarsa: avgENARSA,
        iny_bolivia: avgBolivia,
        iny_escobar: avgEscobar,
        iny_total: totalEst,
      })
    }
  }

  return result
}

// Custom Hook principal
export const useDaily = () => {
  const dailyState = useJson<DailyRow[]>('./data/daily.json')
  const psState = useJson<EnargasPSRow[]>('./data/enargas_ps.json')

  const loading = dailyState.loading || psState.loading
  const error = dailyState.error || psState.error

  const processedData =
    dailyState.data && !loading
      ? processInjectionsFromPS(dailyState.data, psState.data)
      : null

  return {
    ...dailyState,
    loading,
    error,
    data: processedData,
  }
}

export const useComments = () => useJson<Comments>('./data/comments.json')
export const useWeather = () => useJson<WeatherPayload>('./data/weather.json')
export const useDemandForecast = () => useJson<DemandForecast>('./data/demand_forecast.json')
export const useLinepackForecast = () => useJson<LinepackForecast>('./data/linepack_forecast.json')
export const useWeatherRegions = () => useJson<RegionCity[]>('./data/weather_regions.json')
export const useEnargasRDS = () => useJson<EnargasRDSRow[]>('./data/enargas.json')
export const useEnargasING = () => useJson<EnargasINGRow[]>('./data/enargas_ing.json')
export const useEnargasPS = () => useJson<EnargasPSRow[]>('./data/enargas_ps.json')
export const useETGS = () => useJson<ETGSRow[]>('./data/etgs.json')
export const useSMNAlerts = () => useJson<unknown[]>('./data/smn_alerts.json')

export interface CammesaWeek {
  week_num: string | null
  start_date: string | null
  end_date: string | null
  demanda_gwh: number | null
  demanda_mwmed: number | null
  exportacion_gwh: number | null
  exportacion_mwmed: number | null
  termico_gwh: number | null
  termico_mwmed: number | null
  hidraulico_gwh: number | null
  hidraulico_mwmed: number | null
  nuclear_gwh: number | null
  nuclear_mwmed: number | null
  renovable_gwh: number | null
  renovable_mwmed: number | null
  importacion_gwh: number | null
  importacion_mwmed: number | null
  gas_mm3_dia: number | null
  fo_miles_ton: number | null
  go_miles_m3: number | null
  carbon_miles_ton: number | null
}

export interface CammesaWeeklyPayload {
  report_date: string | null
  report_filename: string | null
  weeks: CammesaWeek[]
}

export const useCammesaWeekly = () => useJson<CammesaWeeklyPayload>('./data/cammesa_weekly.json')

export interface CammesaPPORow {
  fecha: string
  gas_mmm3: number | null
  gasoil_m3: number | null
  fueloil_tn: number | null
  carbon_tn: number | null
  gen_gas_mwh?: number | null
  plants_counted?: number
  source?: string
}

export const useCammesaPPO = () => useJson<CammesaPPORow[]>('./data/cammesa_ppo.json')

export interface BacktestPoint {
  fecha: string
  actual: number | null
  predicted: number | null
}

export interface BacktestSegment {
  metrics: { mae: number | null; mape: number | null; n: number }
  series: BacktestPoint[]
}

export interface ForecastBacktest {
  test_days: number
  train_days: number
  segments: Record<string, BacktestSegment>
}

export const useForecastBacktest = () => useJson<ForecastBacktest>('./data/forecast_backtest.json')

export interface MEGSABenchmark {
  product: string
  productName: string
  units: string
  currentPrice: number
  previousPrice: number | null
  nominalDifference: number | null
  percentageDifference: number | null
  currentPeriod: string
  displayName: string
  marketType?: string
}

export interface MEGSARonda {
  id: number
  descripcion: string
  publicaDesde: string
  fechaUltimaModificacion: string
}

export interface MEGSAPayload {
  benchmarks: MEGSABenchmark[]
  dolar: { currentPrice?: number; previousPrice?: number | null; percentageDifference?: number | null; lastUpdated?: string } | null
  rondas: MEGSARonda[]
  fetched_at: string
}

export const useMEGSA = () => useJson<MEGSAPayload>('./data/megsa.json')

export interface ProduccionMes {
  mes: string
  area: string
  empresa: string
  cuenca: string
  provincia: string
  prod_gas_mm3: number
  prod_pet_m3: number
  prod_agua_m3: number
  pozos_activos: number
  pozos_no_conv: number
}

export const useProduccionNeuquina = () => useJson<ProduccionMes[]>('./data/produccion_neuquina.json')

export interface ProduccionHistoricoRow {
  area: string
  empresa: string
  gas_acumulado_mm3: number
  pet_acumulado_m3: number
  agua_acumulada_m3: number
  primer_mes: string | null
  ultimo_mes: string | null
  meses_activos: number
  anios_cubiertos: number[]
}

export const useProduccionHistorico = () => useJson<ProduccionHistoricoRow[]>('./data/produccion_neuquina_historico.json')

export interface PozoTerminadoMes {
  mes: string
  area: string
  cuenca: string
  provincia: string
  pozos: number
  pozos_pet: number
  pozos_gas: number
  pozos_serv: number
  pozos_otros: number
}

export const usePozosTerminados = () => useJson<PozoTerminadoMes[]>('./data/pozos_terminados.json')

export interface PlanDesarrollo {
  id: string
  operador: string
  titulo: string
  fecha_anuncio: string
  horizonte: string | null
  monto_usd_millones: number | null
  categoria: 'estrategia' | 'upstream' | 'midstream' | 'infraestructura' | 'M&A' | 'desinversión' | string
  comentario: string
  fuente_url: string
}

export const usePlanesDesarrollo = () => useJson<PlanDesarrollo[]>('./data/planes_desarrollo.json')

export interface ConcesionFeature {
  type: 'Feature'
  properties: {
    id: string
    nombre: string
    operador: string
    interesados: string
    participacion: string
    comentario: string
  }
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
}

export interface ConcesionesCollection {
  type: 'FeatureCollection'
  features: ConcesionFeature[]
  crs?: unknown
  metadata?: { source?: string; source_url?: string; filter?: string }
}

export function useConcesionesNeuquina() {
  const [state, setState] = useState<{
    data: ConcesionesCollection | null
    loading: boolean
    error: Error | null
  }>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    fetch('./data/concesiones_neuquina.geojson', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ConcesionesCollection) => {
        if (!cancelled) setState({ data: d, loading: false, error: null })
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error: e })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export interface TramoRow {
  fecha: string
  gas_andes_autorizacion: number | null
  cco_capacidad: number | null
  cco_corte: number | null
  tgs_nqn_capacidad: number | null
  tgs_nqn_corte: number | null
}

export const useTramos = () => useJson<TramoRow[]>('./data/tramos.json')

export interface GasoductoRow {
  fecha: string
  tgn_centro_oeste: number | null
  tgn_norte: number | null
  tgn_otros: number | null
  tgs_neuba: number | null
  tgs_san_martin: number | null
  tgs_otros: number | null
  distr_malargue: number | null
  distr_sur: number | null
  distr_otros: number | null
  total: number | null
}

export interface CuencaRow {
  fecha: string
  tgn_neuquina: number | null
  tgn_noroeste: number | null
  tgn_otros: number | null
  tgs_neuquina: number | null
  tgs_san_jorge: number | null
  tgs_austral: number | null
  tgs_otros: number | null
  distribuidoras_propios: number | null
  otros_origenes: number | null
  total: number | null
}

export interface GedRow {
  fecha: string
  metrogas?: number | null
  naturgy_ban?: number | null
  pampeana?: number | null
  sur?: number | null
  litoral?: number | null
  centro?: number | null
  cuyana?: number | null
  gasnor?: number | null
  gasnea?: number | null
}

export interface EnargasMonthly {
  gas_recibido?: { cuenca: CuencaRow[]; gasoducto: GasoductoRow[] }
  contratos_firme?: Record<string, number | string>[]
  gas_entregado?: GedRow[]
}

export const useEnargasMonthly = () => useJson<EnargasMonthly>('./data/enargas_monthly.json')

export interface GasNode {
  nodeId: string
  nombre: string
  latitud: number
  longitud: number
  x: number
  y: number
  roleProxy: 'source_proxy' | 'sink_proxy' | 'transit' | 'inactive' | 'unknown'
  hasCompressor?: boolean
}

export interface GasRoute {
  edgeId: string
  ruta: string
  origen: string
  destino: string
  gasoducto: string
  sourceNodeId: string
  targetNodeId: string
  xOrigen: number
  yOrigen: number
  xDestino: number
  yDestino: number
  effectiveCapacity?: number | null
  latest_caudal?: number | null
  latest_utilization?: number | null
}

export interface GasNetwork {
  projection: string
  latestSnapshotDate?: string
  nodes: GasNode[]
  routes: GasRoute[]
}

export const useGasNetwork = () => useJson<GasNetwork>('./data/gas_network.json')

export interface OutlineVertex { lon: number; lat: number; x: number; y: number }

export interface CountryOutline {
  projection: string
  polygons: OutlineVertex[][]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

export const useOutline = () => useJson<CountryOutline>('./data/ar_outline.json')

export interface DistribuidoraFeature {
  type: 'Feature'
  properties: { id: string; name: string }
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
}

export interface DistribuidorasCollection {
  type: 'FeatureCollection'
  features: DistribuidoraFeature[]
  crs?: unknown
}

export interface ProvinciaConsumoRow {
  fecha: string
  [provinciaSlug: string]: number | string | null
}

export const useEnargasProvincias = () =>
  useJson<ProvinciaConsumoRow[]>('./data/enargas_provincias.json')

export interface ProvinciaFeature {
  type: 'Feature'
  properties: { id: string; name: string; area_km2: number }
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
}

export interface ProvinciasCollection {
  type: 'FeatureCollection'
  features: ProvinciaFeature[]
  crs?: unknown
}

export function useProvincias() {
  const [state, setState] = useState<{ data: ProvinciasCollection | null; loading: boolean; error: Error | null }>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    fetch('./data/provincias.geojson', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ProvinciasCollection) => {
        if (!cancelled) setState({ data: d, loading: false, error: null })
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error: e })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export interface TGNSystemStateRow {
  fecha?: string | null
  'Día Operativo': string
  'Actual': string
  'Equilibrio': string
  'Desbalance del sistema': string
  'Desbalance porcentual': string
}

export const useTGNSystemState = () =>
  useJson<TGNSystemStateRow[]>('./data/tgn_system_state.json')

export function useDistribuidoras() {
  const [state, setState] = useState<{ data: DistribuidorasCollection | null; loading: boolean; error: Error | null }>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    fetch('./data/distribuidoras.geojson', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: DistribuidorasCollection) => {
        if (!cancelled) setState({ data: d, loading: false, error: null })
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error: e })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
