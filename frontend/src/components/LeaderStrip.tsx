import { useEffect, useState } from 'react'
import { leaderboard } from '../utils/leaderboard'
import { fmtInt } from '../utils/format'

/** Строка турнира над сценой: очки участников, текущий игрок выделен. */
export function LeaderStrip({ points }: { points: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const rows = leaderboard(points, elapsed).slice(0, 6)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
      <span className="label" style={{ marginBottom: 6 }}>
        Турнир
      </span>
      {rows.map((row) => (
        <div
          key={row.name}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 5,
            transition: 'all .4s ease',
          }}
        >
          <span
            className="num"
            style={{
              fontSize: row.isPlayer ? 19 : 15,
              fontWeight: row.isPlayer ? 800 : 700,
              color: row.isPlayer ? 'var(--amber)' : 'rgba(242,234,219,.55)',
            }}
          >
            {fmtInt(row.points)}
          </span>
          <div
            style={{
              width: row.isPlayer ? 48 : 40,
              height: row.isPlayer ? 6 : 4,
              background: row.isPlayer ? 'var(--amber)' : 'rgba(242,234,219,.28)',
            }}
          />
        </div>
      ))}
    </div>
  )
}
