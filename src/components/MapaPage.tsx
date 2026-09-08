import { useEnargasMonthly, useGasNetwork, useOutline, useDistribuidoras, useEnargasING, useEnargasRDS, useEnargasProvincias, useProvincias } from '../hooks/useData'
import { card, colors, sectionTitle, space } from '../theme'
import NetworkMap from './NetworkMap'
import { RegionalSection } from './GasoductoFlowChart'
import { ChartSkeleton, SkeletonBlock } from './Skeleton'

// Map view: full-width network map, regional monthly flows, and (when present)
// the daily injection-per-gasoducto panel from ENARGAS ING.
export default function MapaPage() {
  const monthlyState = useEnargasMonthly()
  const networkState = useGasNetwork()
  const outlineState = useOutline()
  const distribuidorasState = useDistribuidoras()
  const ingState = useEnargasING()
  const rdsState = useEnargasRDS()
  const provConsumoState = useEnargasProvincias()
  const provGeoState = useProvincias()

  if (networkState.loading || outlineState.loading) {
    return (
      <>
        <SkeletonBlock height={48} style={{ marginBottom: space.lg }} />
        <ChartSkeleton height={520} />
      </>
    )
  }

  const ingRows = ingState.data ?? []
  // Sort ascending; show last 14 fechas of real values for the daily table.
  const ingRecent = ingRows
    .filter((r) => r.tipo === 'R' && r.total != null)
    .slice(-14)

  // Latest RDS row carries the full payload (consumos/importaciones) for the
  // national mix donuts.
  const rdsRows = rdsState.data ?? []
  const rdsLatest = rdsRows.length > 0 ? rdsRows[rdsRows.length - 1] : null

  return (
    <>
      <h1 style={{ color: colors.textPrimary, fontSize: 24, fontWeight: 700, marginBottom: space.sm }}>
        Mapa del sistema
      </h1>
      <p style={{ color: colors.textDim, fontSize: 13, marginBottom: space.xl }}>
        Red de transporte: nodos, gasoductos coloreados por operador y utilización, distribuidoras y cuencas.
      </p>

      {networkState.data && outlineState.data && (
        <div style={{ ...card }}>
          <NetworkMap
            network={networkState.data}
            outline={outlineState.data}
            distribuidoras={distribuidorasState.data}
            monthly={monthlyState.data}
            rds={rdsLatest}
            provincias={provGeoState.data}
            provinciasConsumo={provConsumoState.data}
          />
        </div>
      )}

      {ingRecent.length > 0 && (
        <div style={{ ...card, marginTop: space.xl, borderTop: `3px solid ${colors.accent.green}` }}>
          <h3 style={sectionTitle}>Inyección por gasoducto — últimos días (MMm³/d)</h3>
          <p style={{ color: colors.textDim, fontSize: 12, marginTop: -4, marginBottom: space.md }}>
            Fuente: ENARGAS ING (Power BI export). GPFM = Gasoducto Perito Moreno (operado por TGS).
            TGS = San Martín + Neuba I + Neuba II + GPFM. TGN = Centro Oeste + Norte.
          </p>
          <ING_Table rows={ingRecent} />
        </div>
      )}

      {monthlyState.data?.gas_recibido && (
        <div style={{ ...card, marginTop: space.xl }}>
          <RegionalSection monthly={monthlyState.data} />
          <p style={{ color: colors.textDim, fontSize: 11, marginTop: 8 }}>
            Fuente: ENARGAS datos-estadísticos. Cada banda apilada es el volumen mensual recibido
            por ese gasoducto o cuenca. TGS en verdes, TGN en azules, distribuidoras propias en gris.
          </p>
        </div>
      )}
    </>
  )
}

import type { EnargasINGRow } from '../types'

function ING_Table({ rows }: { rows: EnargasINGRow[] }) {
  const fmt = (v: number | null) => (v == null ? '-' : v.toFixed(1))
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: colors.textMuted, textAlign: 'right' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `1px solid ${colors.border}` }}>Fecha</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>San Martín</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>Neuba I</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>Neuba II</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>GPFM</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.accent.green }}>TGS</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>Centro Oeste</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>Norte</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.accent.blue }}>TGN</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, fontWeight: 700 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fecha} style={{ color: colors.textPrimary }}>
              <td style={{ padding: '6px 8px', textAlign: 'left' }}>{r.fecha}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(r.san_martin)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(r.neuba_1)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(r.neuba_2)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(r.gpfm)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: colors.accent.green, fontWeight: 600 }}>{fmt(r.tgs)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(r.centro_oeste)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(r.norte)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: colors.accent.blue, fontWeight: 600 }}>{fmt(r.tgn)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{fmt(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
