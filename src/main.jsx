/* eslint-disable react-refresh/only-export-components */
import { Component, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

function GlobalRuntimeGuard({ children }) {
  const [runtimeError, setRuntimeError] = useState(null)

  useEffect(() => {
    const handleError = (event) => {
      setRuntimeError(event.error ?? new Error(event.message))
    }

    const handleRejection = (event) => {
      setRuntimeError(
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason)),
      )
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  if (runtimeError) {
    return (
      <main
        style={{
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          color: '#18313c',
        }}
      >
        <section
          style={{
            maxWidth: '760px',
            padding: '20px 22px',
            borderRadius: '24px',
            background: 'rgba(255,255,255,0.78)',
            boxShadow: '0 22px 50px rgba(53, 39, 15, 0.12)',
          }}
        >
          <h1 style={{ marginTop: 0 }}>Runtime Error</h1>
          <p style={{ marginBottom: '12px' }}>
            The app failed after startup. Please share this message.
          </p>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            }}
          >
            {String(runtimeError?.stack ?? runtimeError?.message ?? runtimeError)}
          </pre>
        </section>
      </main>
    )
  }

  return children
}

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <main
          style={{
            minHeight: '100svh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            color: '#18313c',
          }}
        >
          <section
            style={{
              maxWidth: '680px',
              padding: '20px 22px',
              borderRadius: '24px',
              background: 'rgba(255,255,255,0.78)',
              boxShadow: '0 22px 50px rgba(53, 39, 15, 0.12)',
            }}
          >
            <h1 style={{ marginTop: 0 }}>Runtime Error</h1>
            <p style={{ marginBottom: '12px' }}>
              The app hit an error while rendering.
            </p>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              }}
            >
              {String(this.state.error?.message ?? this.state.error)}
            </pre>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <GlobalRuntimeGuard>
      <App />
    </GlobalRuntimeGuard>
  </RootErrorBoundary>,
)
