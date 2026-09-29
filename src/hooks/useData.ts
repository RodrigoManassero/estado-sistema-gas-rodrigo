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

// Re-exported so components that historically imported from this file still work.
export type { ForecastDay, DemandForecastDay, DemandForecast } from '../types'

/**
 * Loads a JSON file from /public/data/ and unwraps the {generated_at, data}
 * envelope produced by the Python pipeline. Legacy payloads (no envelope) are
 * returned as-is.
 */
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
 * Función que toma los datos de daily.json y proyecta la inyección para
 * los días futuros sin datos reales, manteniendo la proporción sobre la demanda estimada.
 */
export function processInjectionsWithForecast(rows: DailyRow[]): DailyRow[] {
  if (!rows || rows.length === 0) return []

  // Identificar los últimos 3 días reales con datos de inyección válidos
  const validHistorical = rows.filter(
    (r) => r.iny_tgs !== undefined && r.iny_tgs !== null && r.iny_tgs > 0
  )
  const recent = validHistorical.slice(-3)

  let avgTGS = 0,
    avgTGN = 0,
    avgENARSA = 0,
    avgBolivia = 0,
    avgEscobar = 0
  let avgTotalIny = 0

  if (recent.length > 0) {
    const sum = recent.reduce(
      (acc, r) => {
        const total =
          (r.iny_tgs || 0) +
          (r.iny_tgn || 0) +
          (r.iny_enarsa || 0) +
          (r.iny_bolivia || 0) +
          (r.iny_escobar || 0)
        return {
          tgs: acc.tgs + (r.iny_tgs || 0),
          tgn: acc.tgn + (r.iny_tgn || 0),
          enarsa: acc.enarsa + (r.iny_enarsa || 0),
          bolivia: acc.bolivia + (r.iny_bolivia || 0),
          escobar: acc.escobar + (r.iny_escobar || 0),
          total: acc.total + total,
        }
      },
      { tgs: 0, tgn: 0, enarsa: 0, bolivia: 0, escobar: 0, total: 0 }
    )

    if (sum.total > 0) {
      avgTGS = sum.tgs / sum.total
      avgTGN = sum.tgn / sum.total
      avgENARSA = sum.enarsa / sum.total
      avgBolivia = sum.bolivia / sum.total
      avgEscobar = sum.escobar / sum.total
      avgTotalIny = sum.total / recent.length
    }
  }

  return rows.map((row) => {
    const hasRealInjection =
      row.iny_tgs !== undefined && row.iny_tgs !== null && row.iny_tgs > 0

    if (hasRealInjection) {
      return { ...row, isForecast: false }
    }

    // Acceso seguro a campos de demanda resolviendo la incompatibilidad de tipos con doble cast
    const r = row as unknown as Record<string, number | undefined>
    const estimatedDemand =
      (r.prioritaria || 0) +
      (r.industria || 0) +
      (r.usinas || 0) +
      (r.gnc || 0) +
      (r.exp_tgn || 0) +
      (r.exp_tgs || 0)

    const targetSupply = estimatedDemand > 0 ? estimatedDemand : avgTotalIny

    return {
      ...row,
      isForecast: true,
      iny_tgs: Number((targetSupply * avgTGS).toFixed(2)),
      iny_tgn: Number((targetSupply * avgTGN).toFixed(2)),
      iny_enarsa: Number((targetSupply * avgENARSA).toFixed(2)),
      iny_bolivia: Number((targetSupply * avgBolivia).toFixed(2)),
      iny_escobar: Number((targetSupply * avgEscobar).toFixed(2)),
    }
  })
}

// Custom Hook para obtener los datos de daily.json procesados con la proyección
export const useDaily = () => {
  const state = useJson<DailyRow[]>('./data/daily.json')
  return {
    ...state,
    data: state.data ? processInjectionsWithForecast(state.data) : null,
  }
}

export const useComments = () => useJson<Comments>('./data/comments.json')
export const useWeather = () => useJson<WeatherPayload>('./data/weather.json')
export const useDemandForecast = () => useJson<DemandForecast>('./data/demand_forecast.json')
export const useLinepackForecast = () => useJson<LinepackForecast>('./data/linepack_forecast.json')
export const useWeatherRegions = () => useJson<RegionCity[]>('./data/weather_regions.json')
export const useEnargasRDS = () => useJson<EnargasRDSRow[]>('./data/enargas.json')
export const useEnargasING = () => useJson<EnargasINGRow[]>('./data/enargas_ing.json')

// ENARGAS Proyección Semanal (PS)
export const useEnargasPS = () => useJson<Record<string, number | string | null>[]>('./data/enargas_ps.json')
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
  mes: string                  // YYYY-MM
  area: string                 // areapermisoconcesion (bloque / concesión)
  empresa: string
  cuenca: string
  provincia: string
  prod_gas_mm3: number         // MMm³ (= million m³) acumulado del mes
  prod_pet_m3: number          // m³
  prod_agua_m3: number         // m³
  pozos_activos: number        // wells with prod_gas>0 or prod_pet>0 in the month
  pozos_no_conv: number        // wells where tipo_de_recurso != CONVENCIONAL
}

export const useProduccionNeuquina = () => useJson<ProduccionMes[]>('./data/produccion_neuquina.json')

export interface ProduccionHistoricoRow {
  area: string
  empresa: string
  gas_acumulado_mm3: number             // MMm³ desde el primer registro disponible
  pet_acumulado_m3: number
  agua_acumulada_m3: number
  primer_mes: string | null             // YYYY-MM
  ultimo_mes: string | null
  meses_activos: number
  anios_cubiertos: number[]
}

export const useProduccionHistorico = () => useJson<ProduccionHistoricoRow[]>('./data/produccion_neuquina_historico.json')

export interface PozoTerminadoMes {
  mes: string                  // YYYY-MM
  area: string                 // areapermisoconcesion (bloque / concesión)
  cuenca: string
  provincia: string
  pozos: number                // total pozos terminados en el mes
  pozos_pet: number            // concepto "Productivos de Petróleo"
  pozos_gas: number            // concepto "Productivos de Gas"
  pozos_serv: number           // concepto "Servicio"
  pozos_otros: number          // improductivos y otros
}

export const usePozosTerminados = () => useJson<PozoTerminadoMes[]>('./data/pozos_terminados.json')

export interface PlanDesarrollo {
  id: string
  operador: string
  titulo: string
  fecha_anuncio: string                  // YYYY or YYYY-MM
  horizonte: string | null               // e.g. "2024-2028"
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
