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

/**
 * "System flow" summary: supply sources on the left, transport state in the
 * middle, demand sinks on the right. Numbers come from the latest RDS. Local
 * production isn't reported directly — we derive it from the flow identity
 *   local = consumo + exports + Δlinepack − imports
 * which by construction makes the balance check zero out exactly; the value
 * is in surfacing the composition, not in verifying consistency.
 *
 * NOTE: the RDS `consumo_total_estimado` ALREADY includes exportaciones (its
 * TOTAL line = the 5 segments + exports), so it stands in for "consumo +
 * exports" directly — don't add exportsTotal on top of it or exports get
 * double-counted (which inflated both the demand total and derived local).
 */
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
  const cammesa = cons.cammesa?.programa ?? 0
  const industria = cons.industria?.programa ?? 0
  const gnc = cons.gnc?.programa ?? 0
  const combustible = cons.combustible?.programa ?? 0

  const exps = latest.exportaciones ?? {}
  const exp_tgn = exps.tgn?.vol_exportar ?? 0
  const exp_tgs = exps.tgs?.vol_exportar ?? 0
  const exportsTotal = exp_tgn + exp_tgs

  // consumo_total_estimado ya incluye exportaciones; solo el fallback (suma de
  // segmentos) necesita sumarlas para no subcontar.
  const demandTotal = latest.consumo_total_estimado
    ?? prioritaria + cammesa + industria + gnc + combustible + exportsTotal
  const deltaLP = latest.linepack_delta ?? 0

  const local = Math.max(0, demandTotal + deltaLP - importsTotal)
  const supplyTotal = local + importsTotal

  const deltaColor = Math.abs(deltaLP) < 1 ? colors.textDim
    : deltaLP > 0 ? colors.status.ok
    : colors.status.err
  const deltaLabel = Math.abs(deltaLP) < 1 ? 'estable'
    : deltaLP > 0 ? 'sumando al stock'
    : 'drawdown'

  return (
    <div>
      <h3 style={sectionTitle}>
        Sistema de transporte — flujo del día
        <span style={{ float: 'right', fontSize: 11, color: colors.textDim, textTransform: 'none', fontWeight: 400 }}>
          {latest.fecha} · MMm³/día
          {generatedAt && ` · actualizado ${new Date(generatedAt).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
        </span>
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
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
          linepack={latest.linepack_total ?? null}
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
      <p style={{ color: colors.textDim, fontSize: 11, marginTop: space.md }}>
        Balance: <strong style={{ color: colors.textSecondary }}>oferta − demanda = {(supplyTotal - demandTotal).toFixed(1)}</strong>{' '}
        MMm³/d. El Δ linepack observado fue <strong style={{ color: deltaColor }}>{deltaLP >= 0 ? '+' : ''}{deltaLP.toFixed(1)}</strong>.
        La producción local es el residuo del balance — si hay discrepancia entre fuentes, el número fluctúa.
      </p>
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
      padding: `${space.sm + 2}px ${space.md}px`,
      minWidth: 0,
    }}>
      <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: space.sm }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((i) => {
          const w = max > 0 ? (Math.abs(i.value) / max) * 100 : 0
          return (
            <div key={i.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                <span style={{ color: colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {i.label}
                </span>
                <span style={{ color: colors.textPrimary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {i.value > 0 || i.value === 0 ? i.value.toFixed(1) : '—'}
                </span>
              </div>
              <div style={{ height: 3, background: colors.surface, borderRadius: 2, marginTop: 2, overflow: 'hidden' }}>
                <div style={{ width: `${w}%`, height: '100%', background: color, opacity: 0.55 }} />
              </div>
              {i.note && (
                <div style={{ color: colors.textDim, fontSize: 10, marginTop: 1 }}>{i.note}</div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{
        marginTop: space.sm,
        paddingTop: space.sm,
        borderTop: `1px solid ${colors.border}`,
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{totalLabel}</span>
        <span style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {total.toFixed(1)}
        </span>
      </div>
    </div>
  )
}

function Middle({ linepack, delta, deltaColor, deltaLabel }: { linepack: number | null; delta: number; deltaColor: string; deltaLabel: string }) {
  const arrow = Math.abs(delta) < 1 ? '→' : delta > 0 ? '↑' : '↓'
  return (
    <div style={{
      background: colors.surfaceAlt,
      border: `1px solid ${colors.border}`,
      borderTop: `3px solid ${colors.accent.orange}`,
      borderRadius: 8,
      padding: `${space.sm + 2}px ${space.md}px`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center',
      minWidth: 0,
    }}>
      <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: space.sm, alignSelf: 'flex-start' }}>
        Sistema
      </div>
      <div style={{ color: colors.textDim, fontSize: 11 }}>Line pack total</div>
      <div style={{ color: colors.textPrimary, fontSize: 28, fontWeight: 700, marginTop: 2 }}>
        {linepack != null ? linepack.toFixed(1) : '—'}
        <span style={{ color: colors.textDim, fontSize: 12, fontWeight: 400, marginLeft: 4 }}>MMm³</span>
      </div>
      <div style={{ color: deltaColor, fontSize: 18, fontWeight: 700, marginTop: space.md }}>
        {arrow} {delta >= 0 ? '+' : ''}{delta.toFixed(1)} MMm³
      </div>
      <div style={{ color: colors.textDim, fontSize: 11, marginTop: 2 }}>{deltaLabel}</div>
    </div>
  )
}
