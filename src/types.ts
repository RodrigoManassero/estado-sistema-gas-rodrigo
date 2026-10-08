export interface DailyRow {
  fecha: string
  demanda_total: number | null
  prioritaria: number | null
  industria: number | null
  usinas: number | null
  gnc?: number | null
  exportaciones: number | null
  exp_tgn?: number | null
  exp_tgs?: number | null
  iny_tgs: number | null
  iny_tgn: number | null
  iny_enarsa: number | null
  iny_gpm: number | null
  iny_bolivia: number | null
  iny_escobar: number | null
  iny_chile?: number | null
  iny_total: number | null
  linepack_tgs: number | null
  var_linepack_tgs: number | null
  lim_inf_tgs: number | null
  lim_sup_tgs: number | null
  linepack_tgn: number | null
  var_linepack_tgn: number | null
  lim_inf_tgn: number | null
  lim_sup_tgn: number | null
  linepack_total: number | null
  var_linepack_total: number | null
  lim_inf_total: number | null
  lim_sup_total: number | null
  temp_min_ba: number | null
  temp_max_ba: number | null
  temp_prom_ba: number | null
  temp_min_esquel: number | null
  temp_max_esquel: number | null
  temp_prom_esquel: number | null
  cammesa_gas: number | null
  cammesa_fueloil: number | null
  cammesa_gasoil: number | null
  cammesa_carbon: number | null
  [key: string]: unknown
}

export interface Importacion {
  programa?: number | null
  proximo_barco?: string | null
}

export interface RDSRow {
  fecha?: string
  linepack_total?: number | null
  linepack_delta?: number | null
  consumo_total_estimado?: number | null
  temperatura_ba?: { tm?: number | null } | null
  forecast_temp_ba?: Array<{ fecha: string; min?: number | null; max?: number | null; tm?: number | null }> | null
  importaciones?: {
    escobar?: Importacion
    bahia_blanca?: Importacion
  }
  [k: string]: unknown
}

export interface SystemStatus {
  fecha?: string | null
  tgn?: string | null
  tgs?: string | null
}

export interface EnargasRDSRow {
  fecha?: string
  [key: string]: unknown
}

export interface EnargasPSRow {
  fecha?: string
  [key: string]: unknown
}

export interface EnargasINGRow {
  fecha?: string
  [key: string]: unknown
}

export interface ETGSRow {
  fecha?: string
  [key: string]: unknown
}

export interface Comments {
  [fecha: string]: string
}

export interface WeatherDay {
  fecha?: string
  temp_min?: number | null
  temp_max?: number | null
  temp_prom?: number | null
  [key: string]: unknown
}

export interface WeatherPayload {
  days: WeatherDay[]
  forecast?: WeatherDay[]
  [key: string]: unknown
}

export interface RegionCity {
  nombre: string
  region: string
  [key: string]: unknown
}

export interface DemandForecastDay {
  fecha: string
  demanda_total_est?: number | null
  [key: string]: unknown
}

export interface RegressionLine {
  slope?: number
  intercept?: number
  r2?: number
  [key: string]: unknown
}

export interface LinepackForecastDay {
  fecha: string
  linepack_total_est?: number | null
  linepack_tgn_est?: number | null
  linepack_tgs_est?: number | null
}

export interface LinepackBacktest {
  k: number
  score: number
  mae_by_horizon: Record<string, number>
  persistence_mae?: Record<string, number> | null
}

export interface LinepackForecast {
  forecast: LinepackForecastDay[]
  model: {
    method: string
    formula: string
    target_window_days: number
    note: string
    k: Record<string, number>
    target_recent_mean: Record<string, number | null>
  }
  backtest: Record<string, LinepackBacktest | null>
  anchor: Record<string, { fecha: string | null; level: number | null }>
}

export interface DemandForecast {
  forecast: DemandForecastDay[]
  regression: {
    n_points: number
    features?: string[]
    training_source?: string
    prioritaria: RegressionLine
    demanda_total: RegressionLine
    usinas?: RegressionLine
    industria?: RegressionLine
    gnc?: RegressionLine
    combustible?: RegressionLine
    baseline_exportaciones?: number
    total_method?: string
  }
}

// Every JSON file produced by the pipeline is wrapped in this envelope.
export interface Envelope<T> {
  generated_at: string
  source: string | null
  source_date: string | null
  data: T
  [extra: string]: unknown
}

// Result shape returned by useJson.
export interface FetchState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  meta: {
    generated_at: string | null
    source: string | null
    source_date: string | null
  }
}

export type { ForecastDay } from './types' // Dummy export if needed or can be omitted
