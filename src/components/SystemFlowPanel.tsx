import { colors, sectionTitle, space } from '../theme'

interface Importacion {
  programa?: number | null
}
interface Consumo {
  programa?: number | null
}
interface Exportacion {
  vol_exportar?: number | null
}

interface RDSRow {
  fecha?: string
  linepack_total?: number | null
  linepack_delta?: number | null
  consumo_total_estimado?: number | null
  importaciones?: Record<string, Importacion>
  consumos?: Record<string, Consumo>
  exportaciones?: Record<string, Exportacion>
}

interface Props {
  latest: RDSRow | null | undefined
  generatedAt?: string | null
}

export default function SystemFlowPanel({ latest, generatedAt }: Props) {
  if (!latest || !latest.fecha) return null

  const imps = latest.importaciones ?? {}
  const bolivia = imps.bolivia?.programa ?? 0
  const chile = imps.chile?.programa ?? 0
  const escobar = imps.escobar?.programa ?? 0
  const bahia = imps.bahia_blanca?.programa ?? 0
  const importsTotal = bolivia + chile + escobar + bahia

  const cons = latest.consumos ?? {}
  const prioritaria = cons.prioritaria?.programa ?? 0
  const cammesa = cons.usinas?.programa ?? cons.cammesa?.programa ?? 0
  const industria = cons.industria?.programa ?? 0
  const gnc = cons.gnc?.programa ?? 0
  const combustible = cons.combustible?.programa ?? 0

  const exps = latest.exportaciones ?? {}
  const exp_tgn = exps.tgn?.vol_exportar ?? 0
  const exp_tgs = exps.tgs?.vol_exportar ?? 0
  const exportsTotal = exp_tgn + exp_tgs

  const demandTotal = latest.consumo_total_estimado
    ?? prioritaria + cammesa + industria + gnc + combustible + exportsTotal
  const deltaLP = latest.linepack_delta ?? 0

  const local = Math.max(0, demandTotal + deltaLP - importsTotal)
  const supplyTotal = local + importsTotal

  const deltaColor = Math.abs(deltaLP) < 0.1 
    ? colors.textDim
    : deltaLP > 0 
    ? colors.status.ok 
    : colors.status.err

  const deltaLabel = Math.abs(deltaLP) < 0.1 
    ? 'sin variación'
    : deltaLP > 0 
    ? 'sumando al stock' 
    : 'desabasteciendo stock'

  return (
    <div>
      <h3 style={sectionTitle}>
        Sistema de transporte — flujo del día
        <span style={{ float: 'right', fontSize: 12, color: colors.textDim, textTransform: 'none', fontWeight: 400 }}>
          {latest.fecha} · MMm³/día
          {generatedAt && ` · actualizado ${new Date(generatedAt).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
        </span>
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: space.md,
        alignItems: 'stretch',
      }}>
        <Column
          title="Oferta"
          color={colors.accent.green}
          items={[
            { label: 'Producción local (derivada)', value: local, note: 'Neuquén/Austral/Noroeste' },
            { label: 'Bolivia', value: bolivia },
            { label: 'Chile (interc.)', value: chile },
            { label: 'GNL Escobar', value: escobar },
            { label: 'GNL Bahía Blanca', value: bahia },
          ]}
          total={supplyTotal}
          totalLabel="Total oferta"
        />
        <Middle
          delta={deltaLP}
          deltaColor={deltaColor}
          deltaLabel={deltaLabel}
        />
        <Column
          title="Demanda"
          color={colors.accent.blue}
          items={[
            { label: 'Prioritaria', value: prioritaria, note: 'residencial + comercial' },
            { label: 'CAMMESA (usinas)', value: cammesa },
            { label: 'Industria (P3+GU)', value: industria },
            { label: 'GNC', value: gnc },
            { label: 'Combustible', value: combustible },
            { label: 'Exportación TGN', value: exp_tgn },
            { label: 'Exportación TGS', value: exp_tgs },
          ]}
          total={demandTotal}
          totalLabel="Total demanda"
        />
      </div>
    </div>
  )
}

interface Item { label: string; value: number; note?: string }

function Column({ title, color, items, total, totalLabel }: { title: string; color: string; items: Item[]; total: number; totalLabel: string }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1)
  return (
    <div style={{
      background: colors.surfaceAlt,
      border: `1px solid ${colors.border}`,
      borderTop: `3px solid ${color}`,
      borderRadius: 8,
      padding: `${space.sm + 4}px ${space.md}px`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      minWidth: 0,
    }}>
      <div>
        <div style={{ color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: space.sm + 2 }}>
          {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((i) => {
            const w = max > 0 ? (Math.abs(i.value) / max) * 100 : 0
            return (
              <div key={i.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5 }}>
                  <span style={{ color: colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {i.label}
                  </span>
                  <span style={{ color: colors.textPrimary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {i.value > 0 || i.value === 0 ? i.value.toFixed(1) : '—'}
                  </span>
                </div>
                <div style={{ height: 4, background: colors.surface, borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${w}%`, height: '100%', background: color, opacity: 0.6 }} />
                </div>
                {i.note && (
                  <div style={{ color: colors.textDim, fontSize: 11, marginTop: 1 }}>{i.note}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{
        marginTop: space.md,
        paddingTop: space.sm + 2,
        borderTop: `1px solid ${colors.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
      }}>
        <span style={{ color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{totalLabel}</span>
        <span style={{ color: colors.textPrimary, fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {total.toFixed(1)}
        </span>
      </div>
    </div>
  )
}

function Middle({ delta, deltaColor, deltaLabel }: { delta: number; deltaColor: string; deltaLabel: string }) {
  const arrow = Math.abs(delta) < 0.1 ? '→' : delta > 0 ? '↑' : '↓'
  return (
    <div style={{
      background: colors.surfaceAlt,
      border: `1px solid ${colors.border}`,
      borderTop: `3px solid ${colors.accent.orange}`,
      borderRadius: 8,
      padding: `${space.sm + 4}px ${space.md}px`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'center',
      textAlign: 'center',
      minWidth: 0,
    }}>
      <div style={{ color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: space.sm + 2, alignSelf: 'flex-start' }}>
        Sistema
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: colors.textDim, fontSize: 12, fontWeight: 500 }}>Variación Linepack</div>
        <div style={{ color: deltaColor, fontSize: 32, fontWeight: 700, marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span>{arrow}</span>
          <span>{delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}</span>
          <span style={{ color: colors.textDim, fontSize: 13, fontWeight: 400 }}>MMm³</span>
        </div>
        <div style={{ color: colors.textDim, fontSize: 12, marginTop: 4 }}>{deltaLabel}</div>
      </div>
    </div>
  )
}
