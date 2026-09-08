export interface DailyRow {
  fecha: string
  demanda_total: number | null
  prioritaria: number | null
  industria: number | null
  usinas: number | null
  exportaciones: number | null
  iny_tgs: number | null
  iny_tgn: number | null
  iny_enarsa: number | null
  iny_gpm: number | null
  iny_bolivia: number | null
  iny_escobar: number | null
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
  cammesa_gasoil: number | null
  cammesa_fueloil: number | null
  cammesa_carbon: number | null
  cammesa_total: number | null
  // Estado del sistema TGN (ABII): 'NORMAL' | 'ALERTA' por |desbalance %| vs ±7.
  estado_tgn?: string | null
  // Mezcla de combustibles PROYECTADA (CAMMESA Previsión semanal, repartida a
  // día y en MMm³ gas-equivalente). Sólo poblada en la ventana de pronóstico.
  cammesa_gas_est?: number | null
  cammesa_gasoil_est?: number | null
  cammesa_fueloil_est?: number | null
  cammesa_carbon_est?: number | null
}

// One row of the parsed ENARGAS RDS. Historical rows are "slim" (only a
// subset of fields); the most recent row keeps the full payload including
// prev-year comparisons and the 6-day temperature forecast.
export interface EnargasRDSConsumo {
  programa: number | null
  prom_mes_2025?: number | null
  misma_semana_2025?: number | null
}

export interface EnargasRDSImport {
  programa?: number | null
  proximo_barco?: string | null
  prom_mes_prev_year?: number | null
  misma_semana_prev_year?: number | null
}

export interface EnargasRDSRow {
  fecha?: string
  source?: string
  linepack_total?: number | null
  linepack_delta?: number | null
  consumo_total_estimado?: number | null
  consumos?: Record<string, EnargasRDSConsumo>
  importaciones?: Record<string, EnargasRDSImport>
  exportaciones?: Record<string, { vol_exportar?: number | null }>
  temperatura_ba?: {
    min?: number | null
    max?: number | null
    tm?: number | null
    tm_2025?: number | null
    tm_misma_semana?: number | null
  }
  forecast_temp_ba?: { fecha: string; min: number | null; max: number | null; tm: number | null }[]
}

// One row of the ENARGAS Inyección Nacional por Gasoducto (ING) PDF parser.
// Each row is one fecha; `tipo` is "R" (real) or "P" (programado). Six gas
// pipelines are tracked: san_martin, neuba_1, neuba_2, gpfm (Perito Moreno),
// centro_oeste, norte. `tgs` and `tgn` are derived sums per transportista.
export interface EnargasINGRow {
  fecha: string
  tipo: 'R' | 'P' | null
  san_martin: number | null
  neuba_1: number | null
  neuba_2: number | null
  gpfm: number | null
  centro_oeste: number | null
  norte: number | null
  total: number | null
  tgs: number | null
  tgn: number | null
  source?: string
}

// One row of the daily TGS "Síntesis del Estado Operativo" report (ETGS),
// arrived via email-ingest. Linepack values are in MMm³ (stock, not delta).
// PCS values are Kcal integers.
export interface ETGSRow {
  fecha: string
  source?: string
  generado_at?: string
  linepack_tgs_dia_anterior: number | null
  linepack_tgs_dia_actual: number | null
  linepack_tgs_variacion: number | null
  alerta_estado: string | null
  alerta_motivo: string | null
  pcs_san_martin: number | null
  pcs_neuba_1: number | null
  pcs_neuba_2: number | null
  pcs_troncal: number | null
  pcs_paralelo: number | null
}

export interface Comments {
  daily: string[]
  weekly: string[]
  note?: string
}

export interface ForecastDay {
  fecha: string
  temp_max: number | null
  temp_min: number | null
  temp_prom: number | null
}

export interface WeatherPayload {
  forecast: ForecastDay[]
}

export interface RegionCity {
  id: string
  label: string
  lat: number
  lon: number
  region: string
  forecast: ForecastDay[]
}

export interface DemandForecastDay {
  fecha: string
  temp_prom: number | null
  prioritaria_est: number | null
  demanda_total_est: number | null
  usinas_est: number | null
  industria_est?: number | null
  gnc_est?: number | null
  combustible_est?: number | null
  exportaciones_est?: number | null
}

export interface RegressionLine {
  slope: number | null
  intercept: number | null
  r2: number | null
  r2_temp_only?: number | null
  label?: string
  n_points?: number
  dow_offsets?: Record<string, number>
  mean_abs_residual?: number | null
  method?: string
}

// Proyección de linepack (reversión a la media; ver generate_linepack_forecast.py).
export interface LinepackForecastDay {
  fecha: string
  temp_prom?: number | null
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
  meta: { generated_at: string | null; source: string | null; source_date: string | null }
}
