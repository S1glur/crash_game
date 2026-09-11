import { useGame } from '../store/gameStore'
import { fmtInt } from '../utils/format'
import { leaderboard } from '../utils/leaderboard'

/** Таблица участников турнира. Топ-3 закреплены сверху, игрок выделен. */
export function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const totalPoints = useGame((s) => s.totalPoints)
  const rows = leaderboard(totalPoints, 0)
  const top = rows.slice(0, 3)
  const rest = rows.slice(3)

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
            flexWrap: 'wrap',
          }}
        >
          <span className="num" style={{ fontSize: 24 }}>
            Таблица участников
          </span>
          <span className="chip chip-amber" style={{ letterSpacing: '.14em' }}>
            До конца 25 дней
          </span>
          <div className="grow" />
          <button className="chip" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div style={{ padding: '16px 24px 0' }}>
          {top.map((row, index) => (
            <Row key={row.name} place={index + 1} name={row.name} points={row.points} isPlayer={row.isPlayer} highlight />
          ))}
        </div>

        <div className="scroll-y" style={{ padding: '8px 24px 20px' }}>
          {rest.map((row, index) => (
            <Row key={row.name} place={index + 4} name={row.name} points={row.points} isPlayer={row.isPlayer} />
          ))}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.5 }}>
            Соперники в прототипе имитируются на клиенте. Ваши очки настоящие — их считает сервер.
          </span>
        </div>
      </div>
    </div>
  )
}

function Row({
  place,
  name,
  points,
  isPlayer,
  highlight,
}: {
  place: number
  name: string
  points: number
  isPlayer: boolean
  highlight?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 16px',
        marginBottom: 8,
        background: isPlayer ? 'var(--amber-dim)' : highlight ? 'rgba(242,234,219,.06)' : 'transparent',
        border: `1px solid ${isPlayer ? 'var(--amber)' : 'transparent'}`,
        borderRadius: 3,
      }}
    >
      <span className="num" style={{ width: 34, fontSize: 20, opacity: 0.6 }}>
        {place}
      </span>
      <span style={{ fontSize: 14, fontWeight: isPlayer ? 800 : 700 }}>
        {isPlayer ? name : maskName(name)}
      </span>
      <div className="grow" />
      <span className="num" style={{ fontSize: 20, color: isPlayer ? 'var(--amber)' : 'var(--cream)' }}>
        {fmtInt(points)}
      </span>
    </div>
  )
}

/** Деперсонализация имён по ТЗ: первые три символа скрыты. */
const maskName = (name: string) => '***' + name.slice(3)
