import { useMemo } from 'react'
import type { RecentRound } from '../api/types'
import { fmtMult } from '../utils/format'

/** Высота области столбцов в пикселях — от неё считаются и столбцы, и линия 2,00. */
const BAR_AREA = 76

/**
 * История завершённых полётов темы, показанная гистограммой: сразу видно,
 * как часто бывают ранние крахи.
 *
 * Строится по РАУНДАМ, а не по ставкам. Раньше сюда шла история ставок, и
 * график врал дважды: раунд с тремя участниками рисовался тремя столбцами, а
 * у тех, кто успел забрать, в столбец попадал их личный момент выхода вместо
 * точки краха. Сводка снизу от этого систематически занижалась — точки выхода
 * всегда ниже точки краха.
 */
export function HistoryChart({ flights }: { flights: RecentRound[] }) {
  const stats = useMemo(() => {
    if (!flights.length) return null
    const values = flights.map((flight) => flight.crashAt).filter((value) => Number.isFinite(value))
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    return {
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      max: sorted[sorted.length - 1],
      aboveTwoPct: Math.round((values.filter((value) => value >= 2).length / values.length) * 100),
    }
  }, [flights])

  const maxValue = stats ? Math.max(stats.max, 2.2) : 1

  // Показываем последние 14: при большем числе подписи под столбцами сливаются,
  // а сводка снизу всё равно считается по всей выборке.
  const bars = [...flights].reverse().slice(-14)

  return (
    <div className="panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="label">Прошлые полёты</span>
        <div className="grow" />
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.45 }}>точка краха каждого раунда</span>
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

          {bars.map((flight) => {
            const height = Math.max(4, (flight.crashAt / maxValue) * BAR_AREA)
            const color =
              flight.crashAt >= 3
                ? 'var(--amber)'
                : flight.crashAt >= 2
                  ? '#e0904e'
                  : flight.crashAt >= 1.3
                    ? '#4e4874'
                    : '#7a4553'

            return (
              <div
                key={flight.roundId}
                title={
                  `${fmtMult(flight.crashAt)} · ` +
                  (flight.betCount > 0
                    ? `участников ${flight.betCount}, выплачено ${flight.totalWin}`
                    : 'без ставок')
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
                  {fmtMult(flight.crashAt)}
                </span>

                {/* Сколько человек летело этим раундом; пустой — точка вместо числа. */}
                <span style={{ fontSize: 8, lineHeight: 1, opacity: 0.55 }}>
                  {flight.betCount > 0 ? flight.betCount : '·'}
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
