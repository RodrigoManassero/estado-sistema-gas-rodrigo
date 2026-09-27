import { useETGS } from '../hooks/useData'
import { card, colors, sectionTitle, space } from '../theme'

interface ETGSDataRow {
  fecha: string
  linepack_tgs_dia_actual: number | null
  linepack_tgs_variacion: number | null
  estado?: 'Normal' | 'Alerta' | 'Crítico' | 'Emergencia' | string
  motivo?: string | null
}

interface Props {
  estByDate?: Map<string, number>
}

const LINEPACK_EQUILIBRIO_M3 = 224_486_000      // Linepack de equilibrio
const CAPACIDAD_TRANSPORTE_TGS_M3 = 92_393_583  // Capacidad de Transporte TGS

function EstadoBadge({ estado }: { estado: string }) {
  const up = estado.toUpperCase()
  let color: string = colors.status.ok
  if (up.includes('ALERT') || up.includes('ALERTA') || up.includes('ALTO')) color = colors.status.warn
  if (up.includes('EMERG') || up.includes('CRÍT') || up.includes('CRIT') || up.includes('BAJO')) color = colors.status.err

  return (
    <span
      style={{
        background: color + '22',
        color: color,
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 700,
        display: 'inline-block',
        marginTop: 4,
      }}
    >
      {up}
    </span>
  )
}

function Stat({ label, value, sub, children }: { label: string; value?: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: colors.textDim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      {children ? (
        children
      ) : (
        <div style={{ color: colors.textPrimary, fontSize: 22, fontWeight: 700, marginTop: 4 }}>
          {value}
        </div>
      )}
      {sub && (
        <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export default function TGSPanel(_props: Props) {
  const { data, meta } = useETGS()
  const rows: ETGSDataRow[] = (data as ETGSDataRow[]) ?? []
  
  if (rows.length === 0) return null

  // Usar siempre el último dato real del día anterior
  const latest = rows[rows.length - 1]

  const lp = latest.linepack_tgs_dia_actual
  const fechaLabel = latest.fecha
  const variacion = latest.linepack_tgs_variacion
  const estado = latest.estado ?? 'Normal'

  // Desbalance % = (Linepack de equilibrio − Linepack actual) / Capacidad de Transporte TGS
  const lpActualM3 = lp != null ? lp * 1_000_000 : null
  const desbalancePct = lpActualM3 != null
    ? ((LINEPACK_EQUILIBRIO_M3 - lpActualM3) / CAPACIDAD_TRANSPORTE_TGS_M3) * 100
    : null

  const dateLabel = fechaLabel
    ? new Date(fechaLabel + 'T00:00:00').toLocaleDateString('es-AR', {
        weekday: 'short', day: '2-digit', month: 'short',
      })
    : '—'

  return (
    <div style={{ ...card, borderTop: `3px solid ${colors.accent.blue}`, marginTop: space.xl }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
        <h3 style={{ ...sectionTitle, margin: 0 }}>
          TGS — Estado del sistema
        </h3>
        <div style={{ color: colors.textDim, fontSize: 12 }}>
          Día operativo: <strong style={{ color: colors.textSecondary }}>{dateLabel}</strong>
          {meta?.generated_at && (
            <> · actualizado {new Date(meta.generated_at).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' })}</>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: space.md, padding: `${space.sm}px 0` }}>
        <Stat 
          label="Linepack TGS" 
          value={lp != null ? `${lp.toFixed(2)} MMm³` : '—'} 
          sub={variacion != null ? `${variacion >= 0 ? '+' : ''}${variacion.toFixed(2)} vs anterior` : 'Volumen en el sistema'} 
        />
        <Stat 
          label="Equilibrio" 
          value={`${(LINEPACK_EQUILIBRIO_M3 / 1_000_000).toFixed(2)} MMm³`} 
        />
        <Stat label="Estado">
          <EstadoBadge estado={estado} />
        </Stat>
        <Stat 
          label="Desbalance %" 
          value={desbalancePct != null ? `${desbalancePct >= 0 ? '+' : ''}${desbalancePct.toFixed(2)}%` : '—'} 
          sub="(equilibrio − actual) / cap. transporte" 
        />
      </div>
    </div>
  )
}
