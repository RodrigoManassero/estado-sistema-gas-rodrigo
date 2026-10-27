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
  cammesa_gasoil: number | null
  cammesa_fueloil: number | null
  cammesa_carbon: number | null
  cammesa_total: number | null
  isForecast?: boolean
  estado_tgn?: string | null
  estado_tgs?: string | null
  cammesa_gas_est?: number | null
  cammesa_gasoil_est?: number | null
  cammesa_fueloil_est?: number | null
  cammesa_carbon_est?: number | null
}

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

export interface WeatherHistoryDay {
  fecha: string
  temp_prom?: number | null
  temp_min?: number | null
  temp_max?: number | null
}

export interface WeatherHistoryRecord {
  id: string
  label?: string
  region?: string
  history: WeatherHistoryDay[]
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

export interface Envelope<T> {
  generated_at: string
  source: string | null
  source_date: string | null
  data: T
  [extra: string]: unknown
}

export interface FetchState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  meta: { generated_at: string | null; source: string | null; source_date: string | null }
}

// --- Mantenimientos ---
export type MantenimientoCategoria = 'transporte' | 'inyeccion' | 'otros'
export type MantenimientoSigno = 'negativo' | 'positivo' | 'mixto' | 'cero' | 'sin_dato'

// Aliases requeridos por los componentes de mantenimientos
export type CategoriaKey = MantenimientoCategoria
export type SignoImpacto = MantenimientoSigno

export interface MantenimientoFila {
  id: string
  fecha_desde: string
  fecha_hasta: string
  dias: number
  cuenca: string
  empresa: string
  categoria: string
  categoria_key: CategoriaKey
  instalacion: string | null
  tarea: string | null
  impacto_texto: string
  impacto_min: number | null
  impacto_max: number | null
  signo_impacto: SignoImpacto
  sin_impacto: boolean
  unidad: string
  impactos_en_comentario_mm3d: number[]
  duracion_mencionada: string | null
  multiples_trabajos: boolean
  texto_variable_durante_evento: boolean
  color: string | string[] | null
  autores: string[]
  celda_desde: string
  celda_hasta: string
  comentario_raw: string
}

export type MantenimientoRow = MantenimientoFila

export interface MantenimientoImpactoDia {
  fecha: string
  eventos_activos: number
  reduccion_transporte: number
  reduccion_inyeccion: number
  reduccion_otros: number
  aumento_total: number
}

export type ImpactoDia = MantenimientoImpactoDia

export interface MantenimientosMetadata {
  archivo_origen: string
  hoja: string
  generado_en: string
  fecha_desde: string
  fecha_hasta: string
  cantidad_dias: number
  unidad: string
  cantidad_cuencas: number
  cantidad_eventos: number
  comentarios_en_excel: number
  filas_tabla_mantenimientos: number
  tabla_filtrada_desde_hoy: boolean
}

export interface MantenimientosData {
  metadata: MantenimientosMetadata
  tabla: MantenimientoFila[]
  impacto_diario: MantenimientoImpactoDia[]
  advertencias: string[]
}
