import { colors, space } from '../theme'

type Wave = 0 | 1 | 2 | 3 | 4 | 5 | 6

const items: { task: string; status: 'done' | 'pending'; wave: Wave; notes: string }[] = [
  // Base / preexistente
  { task: 'Parser de Excel base', status: 'done', wave: 0, notes: 'Header-driven + validación de columnas' },
  { task: 'Dashboard React con KPIs y charts', status: 'done', wave: 0, notes: 'Recharts, dark theme, responsive' },
  { task: 'Panel de estado TGS/TGN con badges', status: 'done', wave: 0, notes: 'Ventana 3 días, NORMAL/BAJO/ALTO' },
  { task: 'Comparación semanal automática', status: 'done', wave: 0, notes: 'Sem N vs N-1 sobre demanda/temp/inyecciones' },
  { task: 'Forecast de demanda por regresión', status: 'done', wave: 0, notes: 'R²=0.45 prioritaria — hay que mejorar con +data' },
  { task: 'Comentarios auto-generados', status: 'done', wave: 0, notes: 'Diarios + semanales desde forecast' },
  { task: 'Deploy GitHub Pages + Actions cron', status: 'done', wave: 0, notes: 'Build nocturno automático' },

  // Wave 0 — foundation
  { task: 'Envelope {generated_at} en todos los JSON', status: 'done', wave: 0, notes: 'Source + fecha de generación en cada archivo' },
  { task: 'Hook useJson<T> genérico', status: 'done', wave: 0, notes: 'Unwrapping + error + meta automático' },
  { task: 'ErrorBoundary + loading skeletons', status: 'done', wave: 0, notes: 'No más "Cargando datos…"' },
  { task: 'Data freshness banner', status: 'done', wave: 0, notes: 'Badges de color por fuente en el header' },
  { task: 'Theme tokens extraídos (theme.ts)', status: 'done', wave: 0, notes: 'Sin hex codes inline' },
  { task: 'Mobile responsive', status: 'done', wave: 0, notes: 'Grids minmax, charts fluidos, tabs scroll' },
  { task: 'LinepackChart sin límites hardcodeados', status: 'done', wave: 0, notes: 'Lee lim_inf/lim_sup del data' },
  { task: 'Drop folder raw/incoming/', status: 'done', wave: 0, notes: 'Detecta tipo por magic bytes, archiva con timestamp' },
  { task: 'Pipeline guards + validación de outputs', status: 'done', wave: 0, notes: 'Exit 1 si algo queda stale' },
  { task: 'Página Guía en español', status: 'done', wave: 0, notes: 'Cómo leer, fuentes, drop folder, limitaciones' },
  { task: 'CI: typecheck + timeout en workflow', status: 'done', wave: 0, notes: 'Falla antes del deploy si algo rompe' },

  // Wave 1 — geográfico
  { task: 'Multi-ciudad weather (10 ciudades)', status: 'done', wave: 1, notes: 'Open-Meteo BA + Rosario + Córdoba + ... + Esquel' },
  { task: 'Mapa regional con MapLibre', status: 'pending', wave: 1, notes: 'Removido por ahora — se puede retomar con estilo tipo gasoductos' },
  { task: 'TemperatureChart con selector de ciudad', status: 'done', wave: 1, notes: 'Dropdown cambia la ciudad' },
  { task: 'Ranking ciudades más frías', status: 'done', wave: 1, notes: 'Top-5 sobre próximos 7 días' },

  // Wave 2 — más fuentes públicas
  { task: 'ENARGAS RDS diario (automático)', status: 'done', wave: 2, notes: 'Line pack, importaciones, exportaciones, consumos, temp BA — todo del PDF oficial' },
  { task: 'Backfill ENARGAS RDS (2 años)', status: 'done', wave: 2, notes: 'Descarga RDS_YYYYMMDD.pdf hasta 730 días atrás, parse-and-discard' },
  { task: 'Panel ENARGAS RDS en outlook', status: 'done', wave: 2, notes: 'Stats + breakdown por consumo/importación/exportación' },
  { task: 'Chart año-sobre-año (histórico)', status: 'done', wave: 2, notes: 'Linepack + consumo total en eje calendario con años superpuestos' },
  { task: 'Open-Meteo histórico (2 años × 10 ciudades)', status: 'done', wave: 2, notes: '7310 filas en weather_history.json, listas para modelo' },
  { task: 'Selector de escala temporal + cursor sincronizado', status: 'done', wave: 2, notes: '7d/30d/90d/todo, hover en un chart marca los otros' },
  { task: 'CAMMESA diaria (programación)', status: 'pending', wave: 2, notes: 'Descartado: PDF público dice "Sin novedades", sin contenido útil' },
  { task: 'CAMMESA resultados (PPO diario)', status: 'done', wave: 2, notes: 'API pública + msoffcrypto decrypt. 90 días backfilled. Autoritativo para fuel mix.' },
  { task: 'ENARGAS stock GNL mensual', status: 'pending', wave: 2, notes: 'Escobar + Bahía Blanca — el RDS ya da el snapshot diario' },
  { task: 'SMN alertas meteorológicas', status: 'pending', wave: 2, notes: 'Trigger de picos extremos' },

  // Wave 3 — forecast creíble
  { task: 'Features adicionales en modelo de demanda', status: 'pending', wave: 3, notes: 'Día de semana, feriado, estacionalidad' },
  { task: 'Backtesting del forecast', status: 'pending', wave: 3, notes: 'MAE/MAPE por horizonte' },

  // Wave 4 — interactividad
  { task: 'Date range picker + deep links', status: 'pending', wave: 4, notes: 'URL copiable con filtros' },
  { task: 'Alertas configurables', status: 'pending', wave: 4, notes: 'Umbrales definidos por usuario' },
  { task: 'Export CSV / PDF del outlook', status: 'pending', wave: 4, notes: '' },

  // Fuera de scope inmediato
  { task: 'Datos privados TGS/TGN (credenciales)', status: 'pending', wave: 5, notes: 'Pospuesto — drop folder cubre el caso manual' },
  { task: 'Topología de red tipo gasoductos', status: 'pending', wave: 6, notes: 'Stress coloring por tramo con flujo/capacidad' },
]

const icon = (s: string) => (s === 'done' ? '✓' : '○')
const statusColor = (s: string) => (s === 'done' ? colors.status.ok : colors.textDim)
const waveLabel = (w: Wave) =>
  ['Base', 'Foundation', 'Mapa', 'Más fuentes', 'Forecast', 'Interactividad', 'Privado', 'Red'][w] ?? `W${w}`

export default function StatusPage() {
  const done = items.filter((i) => i.status === 'done').length
  const total = items.length
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: `${space.xl}px ${space.lg}px` }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, marginBottom: 4 }}>
        Estado del proyecto
      </h2>
      <p style={{ color: colors.textDim, fontSize: 14, marginBottom: space.xl }}>
        {done}/{total} tareas completadas — {Math.round((done / total) * 100)}% de avance
      </p>
      <div style={{ background: colors.border, borderRadius: 8, height: 8, marginBottom: space.xl }}>
        <div
          style={{
            background: colors.status.ok,
            borderRadius: 8,
            height: 8,
            width: `${(done / total) * 100}%`,
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {items.map((i) => (
          <div
            key={i.task}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: space.md,
              padding: `${space.sm + 2}px ${space.lg}px`,
              background: colors.surface,
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
            }}
          >
            <span
              style={{
                color: statusColor(i.status),
                fontSize: 18,
                fontWeight: 700,
                minWidth: 20,
                textAlign: 'center',
              }}
            >
              {icon(i.status)}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <p
                  style={{
                    color: i.status === 'done' ? colors.textSecondary : colors.textMuted,
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {i.task}
                </p>
                <span
                  style={{
                    background: colors.surfaceAlt,
                    color: colors.textDim,
                    padding: '1px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}
                >
                  Wave {i.wave} · {waveLabel(i.wave)}
                </span>
              </div>
              {i.notes && <p style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }}>{i.notes}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
