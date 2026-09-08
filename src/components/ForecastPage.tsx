import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { card, colors, sectionTitle, space } from '../theme'
import { useDemandForecast, useForecastBacktest } from '../hooks/useData'
import type { BacktestSegment } from '../hooks/useData'
import type { RegressionLine } from '../types'
import { formatTooltipDate } from '../utils/charts'

const DOW_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DOW_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function quality(r2: number | null | undefined): { color: string; label: string } {
  if (r2 == null) return { color: colors.textDim, label: '—' }
  if (r2 >= 0.7) return { color: colors.status.ok, label: 'alta' }
  if (r2 >= 0.4) return { color: colors.accent.orange, label: 'moderada' }
  return { color: colors.status.err, label: 'baja' }
}

function SegmentBlock({ m }: { m: RegressionLine & { label?: string } }) {
  const q = quality(m.r2)
  const hasLinear = m.slope != null && m.intercept != null
  const sign = m.slope != null && m.slope >= 0 ? '+' : '−'
  const absSlope = m.slope != null ? Math.abs(m.slope).toFixed(2) : '?'
  const maxOffset = m.dow_offsets
    ? Object.values(m.dow_offsets).reduce((acc, v) => Math.max(acc, Math.abs(v)), 0)
    : 0

  return (
    <div style={{ ...card, padding: `${space.lg}px ${space.xl}px` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm, flexWrap: 'wrap', gap: space.sm }}>
        <h4 style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 700 }}>{m.label ?? 'Segmento'}</h4>
        <span style={{ color: q.color, fontSize: 12, fontWeight: 600 }}>
          Calidad {q.label} · R² = {m.r2?.toFixed(2) ?? '?'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: space.sm, marginBottom: space.sm }}>
        <Kv label="Datos entrenados" value={`${m.n_points ?? '?'} días`} />
        <Kv label="Slope vs temp" value={hasLinear ? `${sign}${absSlope} MMm³/°C` : '—'} />
        <Kv label="Intercepto" value={hasLinear ? `${m.intercept?.toFixed(1)} MMm³` : '—'} />
        <Kv label="R² solo temp" value={m.r2_temp_only?.toFixed(2) ?? '—'} />
      </div>

      {m.dow_offsets && (
        <div>
          <p style={{ color: colors.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Ajuste día de semana (MMm³/d)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {DOW_LABELS.map((lbl, i) => {
              const v = m.dow_offsets?.[String(i)] ?? 0
              const w = maxOffset > 0 ? Math.abs(v) / maxOffset : 0
              const bg = v >= 0 ? colors.status.ok : colors.status.err
              return (
                <div key={i} title={`${DOW_FULL[i]}: ${v >= 0 ? '+' : ''}${v.toFixed(1)}`}>
                  <div style={{ position: 'relative', height: 24, background: colors.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, background: bg, opacity: 0.2 + w * 0.6, borderRadius: 3 }} />
                    <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textPrimary, fontSize: 11, fontWeight: 600 }}>
                      {lbl}
                    </span>
                  </div>
                  <div style={{ textAlign: 'center', color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                    {v >= 0 ? '+' : ''}{v.toFixed(1)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: colors.textDim, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: colors.textSecondary, fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function BacktestCard({ label, segment }: { label: string; segment: BacktestSegment }) {
  const { metrics, series } = segment
  const fmt = (d: string) => d.slice(5)
  return (
    <div style={{ ...card, padding: `${space.lg}px ${space.xl}px` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm }}>
        <h4 style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 700 }}>{label}</h4>
        <span style={{ color: colors.textDim, fontSize: 11 }}>
          n = {metrics.n} días
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: space.sm, marginBottom: space.sm }}>
        <Kv label="MAE" value={metrics.mae != null ? `${metrics.mae.toFixed(1)} MMm³/d` : '—'} />
        <Kv label="MAPE" value={metrics.mape != null ? `${metrics.mape.toFixed(1)} %` : '—'} />
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={series}>
          <XAxis dataKey="fecha" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" minTickGap={25} />
          <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8' }}
            labelFormatter={formatTooltipDate}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="actual" stroke={colors.accent.blue} strokeWidth={2} dot={false} name="Real" isAnimationActive={false} />
          <Line type="monotone" dataKey="predicted" stroke={colors.accent.orange} strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Predicho" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function ForecastPage() {
  const { data, loading } = useDemandForecast()
  const backtest = useForecastBacktest()

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: `${space.xl}px ${space.lg}px`, color: colors.textDim }}>
        Cargando…
      </div>
    )
  }
  if (!data) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: `${space.xl}px ${space.lg}px`, color: colors.status.err }}>
        No se pudo cargar demand_forecast.json.
      </div>
    )
  }

  const r = data.regression
  const segments = [
    r.prioritaria,
    r.usinas,
    r.industria,
    r.gnc,
    r.combustible,
  ].filter(Boolean) as (RegressionLine & { label?: string })[]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: `${space.xl}px ${space.lg}px` }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, marginBottom: 4 }}>
        Forecast — metodología y métricas
      </h2>
      <p style={{ color: colors.textDim, fontSize: 14, marginBottom: space.xl }}>
        Cómo generamos la proyección de demanda de 14 días que aparece en el outlook y en la continuación de los charts.
      </p>

      <div style={{ ...card, marginBottom: space.lg }}>
        <h3 style={sectionTitle}>Metodología</h3>
        <ol style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 1.7, paddingLeft: space.xl }}>
          <li>
            <strong>Datos de entrenamiento</strong>: {r.n_points} días del Reporte Diario del Sistema de
            ENARGAS ({r.training_source ?? '2 años backfilled'}). Cada fila trae consumo por segmento en
            MMm³/día y la temperatura media de Buenos Aires.
          </li>
          <li>
            <strong>Un modelo por segmento</strong>: prioritaria (residencial + comercial), usinas
            (generación eléctrica vía CAMMESA), industria (P3 + grandes usuarios), GNC, combustible.
            Cada segmento se ajusta independientemente porque sus drivers son distintos — frío empuja la
            prioritaria hacia arriba, calor empuja usinas hacia arriba.
          </li>
          <li>
            <strong>Features</strong>: temperatura media BA (continua) + día de semana (categórico
            vía offset residual). Método: regresión lineal por mínimos cuadrados sobre la temperatura,
            luego ajuste por day-of-week como media de residuos por día. Todo hecho a mano (sin
            sklearn/numpy) para mantener el pipeline liviano y debuggeable.
          </li>
          <li>
            <strong>Exportaciones</strong>: muy poca variabilidad vs temperatura o calendario; se usa
            la media histórica como constante ({r.baseline_exportaciones ?? '?'} MMm³/d).
          </li>
          <li>
            <strong>Demanda total</strong>: {r.total_method ?? 'regresión directa sobre total'}. Cuando la suma de
            segmentos predichos es más consistente con el observado, se usa la suma; si no, la regresión directa.
          </li>
          <li>
            <strong>Forecast de temperatura</strong>: Open-Meteo 14 días para Buenos Aires (API
            pública, sin API key). La temperatura alimenta el modelo de cada segmento.
          </li>
          <li>
            <strong>Override CAMMESA para usinas</strong>: si CAMMESA publicó su programación semanal
            (PS_ PDF) y cubre la fecha, usamos su valor de usinas en vez de nuestra regresión — ellos
            conocen el plan de dispatch operativo, nosotros solo la correlación con temperatura.
          </li>
        </ol>
      </div>

      <h3 style={{ ...sectionTitle, marginTop: space.xl, marginBottom: space.md }}>Métricas por segmento</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: space.lg }}>
        {segments.map((m, i) => <SegmentBlock key={i} m={m} />)}
      </div>

      {backtest.data && (
        <section style={{ marginTop: space.xl }}>
          <h3 style={{ ...sectionTitle, marginBottom: space.md }}>
            Backtest — cómo predijo vs realidad ({backtest.data.test_days} últimos días, entrenando con {backtest.data.train_days} días previos cada vez)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: space.lg }}>
            {backtest.data.segments.prioritaria && (
              <BacktestCard label="Prioritaria" segment={backtest.data.segments.prioritaria} />
            )}
            {backtest.data.segments.usinas && (
              <BacktestCard label="Usinas" segment={backtest.data.segments.usinas} />
            )}
            {backtest.data.segments.demanda_total && (
              <BacktestCard label="Demanda total" segment={backtest.data.segments.demanda_total} />
            )}
          </div>
          <p style={{ color: colors.textDim, fontSize: 11, marginTop: space.sm }}>
            <strong>MAE</strong> = error medio absoluto en MMm³/d. <strong>MAPE</strong> = error
            porcentual promedio (tiende a inflarse en meses con demanda baja — mes de prioritaria baja
            = denominadores chicos). Test: rolling window, uso temperatura real como proxy (aísla skill
            del modelo del error del pronóstico de temperatura).
          </p>
        </section>
      )}

      <div style={{ ...card, marginTop: space.xl }}>
        <h3 style={sectionTitle}>Cómo leer R²</h3>
        <p style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
          R² mide qué proporción de la variabilidad del segmento explica el modelo (temp + día de semana).
          0 = no mejor que predecir la media; 1 = predicción perfecta. Convenciones del tablero:
        </p>
        <ul style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 1.7, paddingLeft: space.xl }}>
          <li><span style={{ color: colors.status.ok }}>Alta (≥ 0.7)</span>: modelo confiable, usar como referencia.</li>
          <li><span style={{ color: colors.accent.orange }}>Moderada (0.4–0.7)</span>: rango útil, esperar dispersión.</li>
          <li><span style={{ color: colors.status.err }}>Baja (&lt; 0.4)</span>: indicativo — conviene mirar también CAMMESA weekly o dato cerrado.</li>
        </ul>
      </div>

      <div style={{ ...card, marginTop: space.lg }}>
        <h3 style={sectionTitle}>Qué falta / limitaciones</h3>
        <ul style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 1.7, paddingLeft: space.xl }}>
          <li>Temperatura solo BA. Los segmentos residenciales de otras regiones (Córdoba, Mendoza, NOA) pueden desalinear en olas regionales.</li>
          <li>Sin feature de feriados (afectan industria y usinas).</li>
          <li>Sin feature de anomalía climática (cuánto más frío/cálido que lo típico para esta fecha).</li>
          <li>Industria tiene R² = 0.19 — la temp no es buen predictor. Está casi constante por segmento.</li>
          <li>Horizonte 14 días limitado por Open-Meteo. Más allá seria extrapolación.</li>
          <li>No hacemos backtesting formal (MAE/MAPE móvil). Es un pendiente natural con la serie de 720 días.</li>
        </ul>
      </div>
    </div>
  )
}
