import { useMemo } from 'react'
import type { HistoryItem } from '../api/types'
import { fmtMult } from '../utils/format'

/** Высота области столбцов в пикселях — от неё считаются и столбцы, и линия 2,00. */
const BAR_AREA = 76

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

  // Показываем последние 14: при большем числе подписи под столбцами сливаются,
  // а сводка снизу всё равно считается по всей выборке.
  const bars = [...items].reverse().slice(-14)

  return (
    <div className="panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="label">Прошлые полёты</span>
        <div className="grow" />
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.45 }}>● забрал · ✕ крах</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, opacity: 0.5 }}>
          <span style={{ width: 10, height: 3, background: 'var(--amber)' }} />
          отметка 2,00
        </span>
      </div>

      {bars.length === 0 ? (
        <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.5, padding: '18px 0' }}>
          Ещё никто не летал — ваш раунд будет первым в истории.
        </span>
      ) : (
        <div style={{ position: 'relative', display: 'flex', gap: 2 }}>
          {/* Пунктир на отметке 2,00 — глазу нужна опора, иначе столбцы
              сравниваются только друг с другом и абсолютная величина теряется. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: (1 - 2 / maxValue) * BAR_AREA,
              height: 1,
              background:
                'repeating-linear-gradient(90deg, rgba(242,166,73,.55) 0 6px, transparent 6px 12px)',
            }}
          />

          {bars.map((item) => {
            const height = Math.max(4, (item.multiplier / maxValue) * BAR_AREA)
            const color =
              item.multiplier >= 3
                ? 'var(--amber)'
                : item.multiplier >= 2
                  ? '#e0904e'
                  : item.multiplier >= 1.3
                    ? '#4e4874'
                    : '#7a4553'
            const cashedOut = item.result === 'cashout'

            return (
              <div
                key={item.roundId}
                title={
                  `${fmtMult(item.multiplier)} · ${cashedOut ? 'забрал' : 'крах'} · ставка ${item.stake}` +
                  (item.totalPaid > item.stake ? ` (+${item.totalPaid - item.stake} за бустер)` : '')
                }
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {/* Столбец занимает свою колонку целиком: между соседними
                    остаётся только 2px шва, и гистограмма читается как единое
                    полотно, а не как редкий частокол. */}
                <div style={{ height: BAR_AREA, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div
                    style={{
                      width: '100%',
                      height,
                      background: color,
                      transition: 'height .3s ease',
                    }}
                  />
                </div>

                <span
                  className="num"
                  style={{
                    fontSize: 9.5,
                    letterSpacing: 0,
                    color,
                    // Моноширинные цифры: в плотном ряду пропорциональные
                    // пляшут по горизонтали, и колонки визуально расходятся.
                    fontVariantNumeric: 'tabular-nums',
                    // Значения читаются только при полной непрозрачности —
                    // ради них график и переделан.
                    opacity: 0.95,
                  }}
                >
                  {fmtMult(item.multiplier)}
                </span>

                {/* Исход раунда: точка — забрал, крестик — сгорело. */}
                <span style={{ fontSize: 8, lineHeight: 1, opacity: 0.6, color }}>
                  {cashedOut ? '●' : '✕'}
                </span>
              </div>
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
