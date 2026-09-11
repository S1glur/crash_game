import { useGame } from '../store/gameStore'
import { fmtInt } from '../utils/format'

/**
 * Строка турнира над сценой (§1.6 ТЗ): очки участников, текущий игрок выделен
 * цветом темы. Данные настоящие — сервер пересобирает таблицу и рассылает её
 * по /topic/leaderboard на каждом пересечённом уровне, поэтому позиция меняется
 * прямо во время полёта, а не после краха.
 */
export function LeaderStrip() {
  const leaders = useGame((s) => s.leaders)
  const userId = useGame((s) => s.user?.id)

  const rows = leaders.slice(0, 6)
  if (rows.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
      <span className="label" style={{ marginBottom: 6 }}>
        Турнир
      </span>
      {rows.map((row) => {
        const isPlayer = row.playerId === userId
        return (
          <div
            key={row.playerId}
            title={`${row.name} · ${fmtInt(row.points)} очков`}
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
                fontSize: isPlayer ? 19 : 15,
                fontWeight: isPlayer ? 800 : 700,
                color: isPlayer ? 'var(--amber)' : 'rgba(242,234,219,.55)',
              }}
            >
              {fmtInt(row.points)}
            </span>
            <div
              style={{
                width: isPlayer ? 48 : 40,
                height: isPlayer ? 6 : 4,
                background: isPlayer
                  ? 'var(--amber)'
                  : row.inFlight
                    ? 'rgba(242,166,73,.45)'
                    : 'rgba(242,234,219,.28)',
                // Кто сейчас в воздухе — у того очки ещё растут.
                animation: row.inFlight && !isPlayer ? 'markPulse 1.2s ease-in-out infinite' : undefined,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
