import { useState } from 'react'
import { badge, card, colors, radius, space } from '../theme'
import {
  useDaily,
  useWeather,
  useWeatherRegions,
  useEnargasRDS,
  useEnargasING,
  useETGS,
  useCammesaWeekly,
  useCammesaPPO,
  useSMNAlerts,
  useMEGSA,
  useProduccionNeuquina,
  usePozosTerminados,
  usePlanesDesarrollo,
  useTGNSystemState,
  useEnargasProvincias,
} from '../hooks/useData'
import { CATALOG, DatasetEntry, DatasetKind, FreshnessKey } from '../data/datasetCatalog'
import { REPO_ROOT, REPO_BRANCH, githubFileUrl } from '../utils/github'

function ago(iso: string | null): string {
  if (!iso) return 'sin dato'
  const ms = Date.now() - new Date(iso).getTime()
  if (isNaN(ms)) return iso
  const h = ms / 3_600_000
  if (h < 1) return `hace ${Math.round(h * 60)} min`
  if (h < 48) return `hace ${Math.round(h)} h`
  return `hace ${Math.round(h / 24)} d`
}

function kindBadge(k: DatasetKind): React.CSSProperties {
  const colorMap: Record<DatasetKind, string> = {
    auto: colors.status.ok,
    manual: colors.status.warn,
    blocked: colors.status.err,
    discarded: colors.textDim,
  }
  return badge(colorMap[k])
}

function kindLabel(k: DatasetKind): string {
  return { auto: 'AUTO', manual: 'MANUAL', blocked: 'BLOQUEADO', discarded: 'DESCARTADO' }[k]
}

const pillLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  borderRadius: radius.sm,
  background: colors.surfaceAlt,
  border: `1px solid ${colors.border}`,
  color: colors.accent.blue,
  fontSize: 12,
  fontWeight: 500,
  textDecoration: 'none',
}

const pillLinkPrimary: React.CSSProperties = {
  ...pillLink,
  background: colors.accent.blue + '22',
  borderColor: colors.accent.blue + '55',
  color: colors.textPrimary,
}

const subtleLink: React.CSSProperties = {
  color: colors.accent.blue,
  fontSize: 12,
  textDecoration: 'none',
}

function DatasetCard({ entry, freshnessIso }: { entry: DatasetEntry; freshnessIso: string | null | undefined }) {
  const [showScripts, setShowScripts] = useState(false)
  const freshness = entry.freshnessKey && freshnessIso !== undefined ? ago(freshnessIso ?? null) : null
  const docUrl = entry.docRepoPath ? githubFileUrl(entry.docRepoPath) : undefined
  const hasDownloads = !!entry.csvPath || !!entry.jsonPath || !!(entry.extraCsvPaths && entry.extraCsvPaths.length)

  return (
    <div style={{ ...card, padding: `${space.md}px ${space.xl}px` }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: space.sm,
          marginBottom: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h4 style={{ color: colors.textSecondary, fontSize: 14, fontWeight: 600 }}>{entry.name}</h4>
          <span style={kindBadge(entry.kind)}>{kindLabel(entry.kind)}</span>
        </div>
        <div style={{ display: 'flex', gap: space.md, alignItems: 'center' }}>
          <span style={{ color: colors.textDim, fontSize: 12 }}>{entry.frequency}</span>
          {freshness && (
            <span style={{ color: colors.textMuted, fontSize: 12 }}>Última actualización: {freshness}</span>
          )}
        </div>
      </div>

      <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.5, marginBottom: space.md }}>
        {entry.shortDescription}
      </p>

      {hasDownloads && (
        <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', marginBottom: space.sm }}>
          {entry.csvPath && (
            <a href={entry.csvPath} download style={pillLinkPrimary}>
              ↓ Descargar CSV
            </a>
          )}
          {entry.jsonPath && (
            <a href={entry.jsonPath} download style={pillLink}>
              ↓ Descargar JSON
            </a>
          )}
          {entry.extraCsvPaths?.map((extra) => (
            <a key={extra.path} href={extra.path} download style={pillLink}>
              ↓ {extra.label}
            </a>
          ))}
          {entry.sourceUrl && (
            <a href={entry.sourceUrl} target="_blank" rel="noopener" style={pillLink}>
              ↗ Fuente oficial
            </a>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap', alignItems: 'center' }}>
        {docUrl && (
          <a href={docUrl} target="_blank" rel="noopener" style={subtleLink}>
            📄 Ver ficha completa (GitHub)
          </a>
        )}
        {entry.scripts.length > 0 && (
          <button
            onClick={() => setShowScripts((v) => !v)}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.accent.blue,
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showScripts ? '▾' : '▸'} Ver scripts en GitHub ({entry.scripts.length})
          </button>
        )}
      </div>

      {showScripts && entry.scripts.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: `${space.sm}px 0 0 0`,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {entry.scripts.map((s) => (
            <li key={s.file} style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.5 }}>
              <a href={githubFileUrl(s.file)} target="_blank" rel="noopener" style={subtleLink}>
                {s.file}
              </a>
              <span style={{ marginLeft: 6 }}>— {s.purpose}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function FuentesPage() {
  const hooks: Record<FreshnessKey, { meta: { generated_at: string | null } }> = {
    daily: useDaily(),
    weather: useWeather(),
    weatherRegions: useWeatherRegions(),
    rds: useEnargasRDS(),
    ing: useEnargasING(),
    etgs: useETGS(),
    cammesaWeekly: useCammesaWeekly(),
    cammesaPPO: useCammesaPPO(),
    smn: useSMNAlerts(),
    megsa: useMEGSA(),
    capiv: useProduccionNeuquina(),
    pozosTerminados: usePozosTerminados(),
    planesDesarrollo: usePlanesDesarrollo(),
    tgnSystemState: useTGNSystemState(),
    enargasProvincias: useEnargasProvincias(),
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: `${space.xl}px ${space.lg}px` }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, marginBottom: 4 }}>
        Fuentes de datos
      </h2>
      <p style={{ color: colors.textDim, fontSize: 14, marginBottom: space.md }}>
        Estado actual de cada fuente que alimenta el tablero. Todos los datos se pueden descargar en CSV o
        JSON y cada ficha explica paso a paso de dónde sale y cómo se procesa.
      </p>

      <div
        style={{
          ...card,
          padding: `${space.md}px ${space.xl}px`,
          marginBottom: space.lg,
          borderColor: colors.accent.blue + '55',
          background: colors.accent.blue + '11',
        }}
      >
        <p style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          <strong>Todo auditable.</strong> El repositorio es público:{' '}
          <a href={REPO_ROOT} target="_blank" rel="noopener" style={subtleLink}>
            github.com/mpodeley/estado-red-gas
          </a>
          . Cada card de abajo tiene links al dato crudo (CSV/JSON), a la ficha descriptiva y a los scripts
          que procesan la fuente. Para ver el índice de fichas entrar a{' '}
          <a href={githubFileUrl('docs/datasets/README.md')} target="_blank" rel="noopener" style={subtleLink}>
            docs/datasets/
          </a>
          . El pipeline corre todos los días ~6 AM Argentina y committea las actualizaciones en la rama{' '}
          <code style={{ color: colors.textMuted }}>{REPO_BRANCH}</code>.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
        {CATALOG.map((entry) => (
          <DatasetCard
            key={entry.id}
            entry={entry}
            freshnessIso={entry.freshnessKey ? hooks[entry.freshnessKey].meta.generated_at : undefined}
          />
        ))}
      </div>
    </div>
  )
}
