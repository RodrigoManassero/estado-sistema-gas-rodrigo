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
