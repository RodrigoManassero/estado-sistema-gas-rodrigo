import { useEffect, useState } from 'react'
import { colors, radius, space } from './theme'
import ErrorBoundary from './components/ErrorBoundary'
import OperacionPage from './components/OperacionPage'
import MapaPage from './components/MapaPage'
import HistoricoPage from './components/HistoricoPage'
import ProduccionPage from './components/ProduccionPage'
import FuentesPage from './components/FuentesPage'
import StatusPage from './components/StatusPage'
import GuidePage from './components/GuidePage'

type Page = 'operacion' | 'mapa' | 'historico' | 'produccion' | 'guia' | 'fuentes' | 'status'

const VALID_PAGES: readonly Page[] = ['operacion', 'mapa', 'historico', 'produccion', 'guia', 'fuentes', 'status']

// Read ?tab=... from URL on first render so links like ?tab=mapa land directly
// on that page. Also keep the query string in sync as the user navigates so the
// URL is shareable.
function useTabFromURL(): [Page, (p: Page) => void] {
  const [page, setPageState] = useState<Page>(() => {
    const param = new URLSearchParams(window.location.search).get('tab')
    return (VALID_PAGES as readonly string[]).includes(param ?? '') ? (param as Page) : 'operacion'
  })

  useEffect(() => {
    const onPop = () => {
      const param = new URLSearchParams(window.location.search).get('tab')
      if ((VALID_PAGES as readonly string[]).includes(param ?? '')) {
        setPageState(param as Page)
      } else {
        setPageState('operacion')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setPage = (p: Page) => {
    setPageState(p)
    const params = new URLSearchParams(window.location.search)
    params.set('tab', p)
    const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`
    window.history.pushState({}, '', url)
  }

  return [page, setPage]
}

function Nav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const tabs: { id: Page; label: string }[] = [
    { id: 'operacion', label: 'Operación' },
    { id: 'mapa', label: 'Mapa' },
    { id: 'historico', label: 'Histórico' },
    { id: 'produccion', label: 'Producción' },
    { id: 'guia', label: 'Guía' },
    { id: 'fuentes', label: 'Fuentes' },
    { id: 'status', label: 'Estado' },
  ]
  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: active ? colors.border : 'transparent',
    color: active ? colors.textPrimary : colors.textDim,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${space.sm}px ${space.xl}px`,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    display: 'inline-block',
  })
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        marginBottom: space.xl,
        background: colors.surface,
        borderRadius: radius.md,
        padding: 4,
        overflowX: 'auto',
      }}
    >
      {tabs.map((t) => (
        <button key={t.id} onClick={() => setPage(t.id)} style={tabStyle(page === t.id)}>
          {t.label}
        </button>
      ))}
      <a href="./curso/" style={tabStyle(false)} title="Curso introductorio para contribuir al tablero">
        Curso ↗
      </a>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useTabFromURL()

  return (
    <ErrorBoundary>
      {/* Estilos globales inyectados para impresión en PDF prolija y fluida */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: #0f172a !important;
            color: #f1f5f9 !important;
            font-size: 10pt;
          }
          /* Ocultar botones, selectores, navegación, MEGSA y los badges de frescura al imprimir */
          button, 
          .scale-selector,
          nav,
          div[style*="overflow-x: auto"],
          div[style*="border-top: 3px solid #10b981"],
          div[style*="justify-content: flex-end"][style*="flex-wrap: wrap"] {
            display: none !important;
          }

          /* Reducción controlada y suave solo para textos y tablas (~25%) */
          p, span, td, th, li {
            font-size: 9pt !important;
          }
          h3 {
            font-size: 11pt !important;
          }
          h4 {
            font-size: 10pt !important;
          }

          /* Achicar un 25% los textos y elementos exclusivamente del banner principal (PulseCard que usa borde azul #3b82f6) */
          div[style*="border-top: 3px solid #3b82f6"], 
          div[style*="border-top: 3px solid #3b82f6"] * {
            font-size: 75% !important;
          }

          /* Padding compacto para tarjetas para ganar densidad óptima */
          div[style*="background"] {
            padding: 10px !important;
            margin-bottom: 10px !important;
          }

          /* Permitir que la mayoría de los elementos fluyan naturalmente para evitar espacios vacíos gigantes */
          div, section, article {
            break-inside: auto;
            page-break-inside: auto;
          }

          /* Proteger únicamente los gráficos y tablas para que no se partan feo */
          table, .recharts-responsive-container {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Mantener gráficos en un tamaño perfectamente legible */
          .recharts-responsive-container {
            height: 200px !important;
            width: 100% !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${space.xl}px ${space.lg}px` }}>
        <Nav page={page} setPage={setPage} />
        {page === 'operacion' && <OperacionPage />}
        {page === 'mapa' && <MapaPage />}
        {page === 'historico' && <HistoricoPage />}
        {page === 'produccion' && <ProduccionPage />}
        {page === 'guia' && <GuidePage />}
        {page === 'fuentes' && <FuentesPage />}
        {page === 'status' && <StatusPage />}
      </div>
    </ErrorBoundary>
  )
}
