import { useETGS } from '../hooks/useData'
import { card, colors, sectionTitle, space } from '../theme'

// Tipado de la fila según la nueva estructura del JSON
interface ETGSDataRow {
  fecha: string
  linepack_tgs_dia_actual: number | null
  linepack_tgs_variacion: number | null
  estado?: 'Normal' | 'Alerta' | 'Crítico' | 'Emergencia'
  motivo?: string | null
}

// Referencias de desbalance TGS (en m³). Editar acá si cambian: la
// "Capacidad de Transporte TGS" es el divisor del desbalance % y es variable.
const LINEPACK_EQUILIBRIO_M3 = 224_486_000      // Linepack de equilibrio
const CAPACIDAD_TRANSPORTE_TGS_M3 = 92_393_583  // Capacidad de Transporte TGS

// Helper para definir colores según estado y palabras clave en el motivo
function getAlertColor(estado?: string, motivo?: string | null) {
  if (estado === 'Crítico' || estado === 'Emergencia') {
    return colors.status.err
  }
  
  const lowMotivo = (motivo ?? '').toLowerCase()
  if (lowMotivo.includes('bajo')) return colors.status.err
  if (lowMotivo.includes('alto')) return colors.accent.orange

  return colors.accent.orange // Color default para alertas sin bajo/alto
}

export default function TGSPanel({ estByDate }: { estByDate?: Map<string, number> }) {
  const { data, meta } = useETGS()
  const rows: ETGSDataRow[] = data ?? []
  if (rows.length === 0) return null
  const latest = rows[rows.length - 1]

  // Relleno: si el último ETGS quedó viejo y hay estimación para un día
  // posterior (hasta hoy), mostramos la estimación marcada "(est.)".
  const today = new Date().toISOString().slice(0, 10)
  const estDates = [...(estByDate?.keys() ?? [])].filter(f => f > latest.fecha && f <= today).sort()
  const estDate = estDates[estDates.length - 1] ?? null
  const estVal = estDate ? (estByDate?.get(estDate) ?? null) : null
  const useEst = estVal != null

  const lp = useEst ? estVal : latest.linepack_tgs_dia_actual
  const fechaLabel = useEst ? estDate : latest.fecha
  const variacion = useEst ? null : latest.linepack_tgs_variacion

  // Evaluación de alertas
  const estado = useEst ? 'Normal' : (latest.estado ?? 'Normal')
  const motivo = useEst ? null : latest.motivo
  const hasAlert = estado !== 'Normal'

  const alertColor = getAlertColor(estado, motivo)

  // Desbalance % = (Linepack de equilibrio − Linepack actual) / Capacidad de
  // Transporte TGS. lp viene en MMm³ y las constantes en m³, así que convertimos.
  const lpActualM3 = lp != null ? lp * 1_000_000 : null
  const desbalancePct = lpActualM3 != null
    ? ((LINEPACK_EQUILIBRIO_M3 - lpActualM3) / CAPACIDAD_TRANSPORTE_TGS_M3) * 100
    : null

  return (
    <div style={{ ...card, borderTop: `3px solid ${colors.accent.green}`, marginTop: space.xl }}>
      <h3 style={sectionTitle}>
        TGS — Síntesis operativa{' '}
        <span style={{ color: colors.textDim, fontSize: 11, fontWeight: 400, textTransform: 'none', float: 'right' }}>
          {fechaLabel} · fuente: {useEst ? 'estimado' : 'ETGS'}
          {meta.generated_at && ` · actualizado ${new Date(meta.generated_at).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
        </span>
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: space.md, marginTop: space.sm }}>
        <Stat label="Linepack TGS" value={lp != null ? `${lp.toFixed(2)} MMm³${useEst ? ' (est.)' : ''}` : '—'} sub={variacion != null ? `${variacion >= 0 ? '+' : ''}${variacion.toFixed(2)} vs anterior` : undefined} />
        <Stat label="Linepack de equilibrio" value={`${(LINEPACK_EQUILIBRIO_M3 / 1_000_000).toFixed(2)} MMm³`} />
        <Stat label="Desbalance %" value={desbalancePct != null ? `${desbalancePct >= 0 ? '+' : ''}${desbalancePct.toFixed(2)}%` : '—'} sub="(equilibrio − actual) / cap. transporte" />
      </div>

      {hasAlert && (
        <div style={{
          marginTop: space.md,
          background: alertColor + '22',
          border: `1px solid ${alertColor}`,
          borderRadius: 6,
          padding: `${space.sm}px ${space.md}px`,
          color: alertColor,
          fontSize: 13,
          fontWeight: 600,
        }}>
          ⚠ {estado}{motivo ? ` · ${motivo}` : ''}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ color: colors.textDim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
