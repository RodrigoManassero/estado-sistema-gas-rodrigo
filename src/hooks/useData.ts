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

// One wrapper per dataset — gives each a clear name + typed payload.
export const useDaily = () => useJson<DailyRow[]>('./data/daily.json')
export const useComments = () => useJson<Comments>('./data/comments.json')
export const useWeather = () => useJson<WeatherPayload>('./data/weather.json')
export const useDemandForecast = () => useJson<DemandForecast>('./data/demand_forecast.json')
export const useLinepackForecast = () => useJson<LinepackForecast>('./data/linepack_forecast.json')
export const useWeatherRegions = () => useJson<RegionCity[]>('./data/weather_regions.json')
export const useEnargasRDS = () => useJson<EnargasRDSRow[]>('./data/enargas.json')
export const useEnargasING = () => useJson<EnargasINGRow[]>('./data/enargas_ing.json')
// ENARGAS Proyección Semanal (PS) — REAL column actuals. Authority for linepack
// TGN/TGS/total + límites that build_daily.py folds into daily.json.
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
/** Concesiones GeoJSON: standard FeatureCollection, no envelope. Coordinates
 *  in EPSG:4326 (raw lon, lat in degrees) — projection happens in CuencaMap. */
export function useConcesionesNeuquina() {
  const [state, setState] = useState<{
    data: ConcesionesCollection | null
    loading: boolean
    error: Error | null
  }>({ data: null, loading: true, error: null })
  useEffect(() => {
    fetch('./data/concesiones_neuquina.geojson', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ConcesionesCollection) => setState({ data: d, loading: false, error: null }))
      .catch((e: Error) => setState({ data: null, loading: false, error: e }))
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
/** Gas entregado por provincia (ENARGAS GED.xlsx / cuadro 1.06). One row per
 *  month; keys beyond `fecha` are province slugs → dam³/mes (miles de m³).
 *  Tipo de servicio is collapsed (national-only split), so this is the province
 *  total — feeds the choropleth density + per-province trend. */
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
/** Provincias GeoJSON (EPSG:3857, like distribuidoras.geojson): raw
 *  FeatureCollection without the pipeline envelope, so fetch manually. */
export function useProvincias() {
  const [state, setState] = useState<{ data: ProvinciasCollection | null; loading: boolean; error: Error | null }>({
    data: null, loading: true, error: null,
  })
  useEffect(() => {
    fetch('./data/provincias.geojson', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ProvinciasCollection) => setState({ data: d, loading: false, error: null }))
      .catch((e: Error) => setState({ data: null, loading: false, error: e }))
  }, [])
  return state
}

export interface TGNSystemStateRow {
  /** YYYY-MM-DD normalised from the Java toString in 'Día Operativo'. */
  fecha?: string | null
  'Día Operativo': string
  'Actual': string
  'Equilibrio': string
  'Desbalance del sistema': string
  'Desbalance porcentual': string
}
export const useTGNSystemState = () =>
  useJson<TGNSystemStateRow[]>('./data/tgn_system_state.json')

/** Distribuidoras GeoJSON: uses the GeoJSON envelope directly, no pipeline
 *  metadata wrapper — so we can't use useJson's envelope-unwrap. Fetch
 *  manually. */
export function useDistribuidoras() {
  const [state, setState] = useState<{ data: DistribuidorasCollection | null; loading: boolean; error: Error | null }>({
    data: null, loading: true, error: null,
  })
  useEffect(() => {
    fetch('./data/distribuidoras.geojson', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: DistribuidorasCollection) => setState({ data: d, loading: false, error: null }))
      .catch((e: Error) => setState({ data: null, loading: false, error: e }))
  }, [])
  return state
}
