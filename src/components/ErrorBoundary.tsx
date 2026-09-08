import { Component, type ReactNode } from 'react'
import { colors, radius, space } from '../theme'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('Dashboard crashed:', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ maxWidth: 720, margin: '80px auto', padding: space.xl, textAlign: 'center' }}>
        <h1 style={{ color: colors.status.err, fontSize: 22, marginBottom: space.md }}>
          El tablero falló al renderizar
        </h1>
        <pre
          style={{
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            padding: space.lg,
            color: colors.textSecondary,
            fontSize: 13,
            textAlign: 'left',
            overflow: 'auto',
          }}
        >
          {this.state.error.message}
        </pre>
        <button
          onClick={this.reset}
          style={{
            marginTop: space.lg,
            padding: `${space.sm}px ${space.xl}px`,
            background: colors.accent.blue,
            color: colors.textPrimary,
            border: 'none',
            borderRadius: radius.md,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Reintentar
        </button>
        <p style={{ marginTop: space.md, color: colors.textDim, fontSize: 12 }}>
          Si el problema persiste, probá recargar la página (F5) o revisar que los datos estén disponibles.
        </p>
      </div>
    )
  }
}
