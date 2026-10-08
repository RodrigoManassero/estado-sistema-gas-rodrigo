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
              generated_at: env.generated_at,
              source: env.source,
              source_date: env.source_date,
            },
          })
        } else {
          // Legacy payload without envelope.
          setState({
            data: raw as T,
            loading: false,
            error: null,
            meta: { generated_at: null, source: null, source_date: null },
          })
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error: e, meta: { generated_at: null, source: null, source_date: null } })
      })
    return () => {
      cancelled = true
    }
  }, [path])

  return state
}

export const useDaily = () => useJson<DailyRow[]>('./data/daily.json')
export const useInjectionsDaily = () => useJson<DailyRow[]>('./data/injections_daily.json')
export const useComments = () => useJson<Comments>('./data/comments.json')
export const useWeather = () => useJson<WeatherPayload>('./data/weather.json')
export const useWeatherHistory = () => useJson<WeatherPayload>('./data/weather_history.json')
export const useDemandForecast = () => useJson<DemandForecast>('./data/demand_forecast.json')
export const useLinepackForecast = () => useJson<LinepackForecast>('./data/linepack_forecast.json')
export const useWeatherRegions = () => useJson<RegionCity[]>('./data/weather_regions.json')

export const useEnargasRDS = () => useJson<EnargasRDSRow[]>('./data/enargas_rds.json')
export const useEnargasPS = () => useJson<EnargasRDSRow[]>('./data/enargas_ps.json')
export const useETGS = () => useJson<ETGSRow[]>('./data/etgs.json')

export const useEnargasING = () => useJson<EnargasINGRow[]>('./data/enargas_ing.json')

export interface SMNAlert {
  id: string
  title: string
  event: string
  severity: string
  description: string
  effective: string
  expires: string
  regions: string[]
}

export const useSMNAlerts = () => useJson<SMNAlert[]>('./data/smn_alerts.json')

export interface MEGSARow {
  fecha?: string
  transacciones?: number
  volumen_mmm3?: number
  precio_prom_usd?: number
  monto_total_usd?: number
  [key: string]: unknown
}

export const useMEGSA = () => useJson<MEGSARow[]>('./data/megsa.json')

export interface CammesaPPORow {
  fecha?: string
  gas_natural_mmm3?: number
  fuel_oil_ton?: number
  gasoil_m3?: number
  carbon_ton?: number
  [key: string]: unknown
}

export const useCammesaPPO = () => useJson<CammesaPPORow[]>('./data/cammesa_ppo.json')

export interface ProvinciasFeatureProperties {
  nam?: string
  fna?: string
  [key: string]: unknown
}

export interface ProvinciasFeature {
  type: 'Feature'
  properties: ProvinciasFeatureProperties
  geometry: unknown
}

export interface ProvinciasCollection {
  type: 'FeatureCollection'
  features: ProvinciasFeature[]
}

export function useProvinciasGeoJSON() {
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

// --- NUEVO: ESTADO DE SISTEMA TGN / TGS ---
export interface SystemStatus {
  fecha?: string | null
  tgn?: string | null
  tgs?: string | null
}

export const useSystemStatus = () =>
  useJson<SystemStatus>('./data/sistema_estado.json')

export interface DistribuidorasProperties {
  NOM_DIST?: string
  COD_DIST?: string
  [key: string]: unknown
}

export interface DistribuidorasFeature {
  type: 'Feature'
  properties: DistribuidorasProperties
  geometry: unknown
}

export interface DistribuidorasCollection {
  type: 'FeatureCollection'
  features: DistribuidorasFeature[]
}

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
