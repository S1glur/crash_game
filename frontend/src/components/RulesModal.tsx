import { useEffect, useState } from 'react'
import { api } from '../api/client'

/**
 * Правила приходят с бэкенда (GET /api/rules читает docs/rules.md),
 * чтобы текст не расходился с реализованной механикой.
 * Разметка простая, поэтому обходимся без markdown-библиотеки.
 */
export function RulesModal({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .rules()
      .then((response) => setContent(response.content))
      .catch((e) => setError((e as Error).message))
  }, [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '18px 24px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span className="num" style={{ fontSize: 24 }}>
            Правила игры
          </span>
          <div className="grow" />
          <button className="chip" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="scroll-y" style={{ padding: '20px 24px 26px' }}>
          {error && <p style={{ color: 'var(--bordeaux-lt)' }}>Не удалось загрузить правила: {error}</p>}
          {!content && !error && <p style={{ opacity: 0.6 }}>Загружаем…</p>}
          {content && renderMarkdown(content)}
        </div>
      </div>
    </div>
  )
}

function renderMarkdown(source: string) {
  const blocks: React.ReactNode[] = []
  let list: string[] = []

  const flushList = (key: string) => {
    if (!list.length) return
    blocks.push(
      <ul key={key} style={{ margin: '0 0 16px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((item, index) => (
          <li key={index} style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.85 }}>
            {inline(item)}
          </li>
        ))}
      </ul>,
    )
    list = []
  }

  source.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) {
      flushList(`list-${index}`)
      return
    }
    if (line.startsWith('## ')) {
      flushList(`list-${index}`)
      blocks.push(
        <h3 key={index} className="num" style={{ margin: '22px 0 12px', fontSize: 22, color: 'var(--amber)' }}>
          {line.slice(3)}
        </h3>,
      )
      return
    }
    if (line.startsWith('# ')) {
      flushList(`list-${index}`)
      return
    }
    // Служебный комментарий в исходнике — не текст для игрока.
    if (line.startsWith('<!--') || line.endsWith('-->')) {
      flushList(`list-${index}`)
      return
    }
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      list.push(line.replace(/^([-*]|\d+\.)\s/, ''))
      return
    }
    flushList(`list-${index}`)
    blocks.push(
      <p key={index} style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, opacity: 0.85 }}>
        {inline(line)}
      </p>,
    )
  })
  flushList('list-end')
  return blocks
}

/** Только **жирный** и `код` — больше в rules.md ничего нет. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**')) {
      return (
        <b key={index} style={{ color: 'var(--cream)' }}>
          {part.slice(2, -2)}
        </b>
      )
    }
    if (part.startsWith('`')) {
      return (
        <code key={index} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, opacity: 0.8 }}>
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}
