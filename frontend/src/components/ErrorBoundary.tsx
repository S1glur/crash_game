import { Component, type ReactNode } from 'react'

/**
 * Без этого любая ошибка рендера даёт пустой белый экран, и причину видно
 * только в консоли — на демонстрации это худший из возможных сценариев.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 32,
          textAlign: 'center',
          background: 'linear-gradient(180deg, #101530 0%, #38315c 60%, #8c2f3a 100%)',
        }}
      >
        <span className="num" style={{ fontSize: 30 }}>
          Шар не взлетел
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.75, maxWidth: 560 }}>
          {this.state.error.message}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.5, maxWidth: 560 }}>
          Проверьте, что бэкенд запущен на http://localhost:8080
        </span>
        <button
          className="btn btn-primary"
          style={{ height: 52, padding: '0 32px', marginTop: 8 }}
          onClick={() => location.reload()}
        >
          Перезагрузить
        </button>
      </div>
    )
  }
}
