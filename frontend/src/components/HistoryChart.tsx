import { useMemo } from 'react'
import type { HistoryItem } from '../api/types'
import { fmtMult } from '../utils/format'

/**
 * История завершённых раундов всех игроков прототипа (обязательный пункт ТЗ),
 * показанная гистограммой: сразу видно, как часто бывают ранние крахи.
 */
export function HistoryChart({ items }: { items: HistoryItem[] }) {
  const stats = useMemo(() => {
    if (!items.length) return null
    const values = items.map((item) => item.multiplier).filter((value) => Number.isFinite(value))
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    return {
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      max: sorted[sorted.length - 1],
      aboveTwoPct: Math.round((values.filter((value) => value >= 2).length / values.length) * 100),
    }
  }, [items])

  const maxValue = stats ? Math.max(stats.max, 2.2) : 1
  const bars = [...items].reverse()

  return (
    <div className="panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="label">Прошлые полёты</span>
        <div className="grow" />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, opacity: 0.5 }}>
          <span style={{ width: 10, height: 3, background: 'var(--amber)' }} />
          выше 2,00
        </span>
      </div>

      {bars.length === 0 ? (
        <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.5, padding: '18px 0' }}>
          Ещё никто не летал — ваш раунд будет первым в истории.
        </span>
      ) : (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 4, height: 74 }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${(2 / maxValue) * 100}%`,
              height: 1,
              background:
                'repeating-linear-gradient(90deg, rgba(242,166,73,.55) 0 6px, transparent 6px 12px)',
            }}
          />
          {bars.map((item) => {
            const height = Math.max(6, (item.multiplier / maxValue) * 100)
            const color =
              item.multiplier >= 3
                ? 'var(--amber)'
                : item.multiplier >= 2
                  ? '#e0904e'
                  : item.multiplier >= 1.3
                    ? '#4e4874'
                    : '#7a4553'
            return (
              <div
                key={item.roundId}
                title={`${fmtMult(item.multiplier)} · ${item.result === 'cashout' ? 'забрал' : 'крах'}`}
                style={{ flexGrow: 1, height: `${height}%`, background: color, minWidth: 4 }}
              />
            )
          })}
        </div>
      )}

      {stats && (
        <>
          <div className="hr" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <Metric value={fmtMult(stats.mean)} caption="средний" />
            <Metric value={fmtMult(stats.median)} caption="медиана" />
            <Metric value={fmtMult(stats.max)} caption="максимум" accent />
            <Metric value={`${stats.aboveTwoPct} %`} caption="выше 2,00" />
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ value, caption, accent }: { value: string; caption: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="num" style={{ fontSize: 21, color: accent ? 'var(--amber)' : 'var(--cream)' }}>
        {value}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.5 }}>{caption}</span>
    </div>
  )
}
