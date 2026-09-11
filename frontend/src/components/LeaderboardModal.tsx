import { useGame } from '../store/gameStore'
import { fmtInt } from '../utils/format'

/**
 * Таблица участников турнира (§1.7 ТЗ). Топ-3 закреплены сверху, остальные
 * прокручиваются, текущий игрок выделен. Данные серверные и общие: это те же
 * аккаунты, что играют в прототипе, а не выдуманные соперники.
 */
export function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const leaders = useGame((s) => s.leaders)
  const userId = useGame((s) => s.user?.id)

  const top = leaders.slice(0, 3)
  const rest = leaders.slice(3)
  const me = leaders.find((row) => row.playerId === userId)
  // Игрок закреплён внизу, если не попал в видимую часть списка — требование ТЗ.
  const pinned = me && !top.includes(me) ? me : null

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
          {top.map((row) => (
            <Row
              key={row.playerId}
              place={row.place}
              name={row.name}
              points={row.points}
              inFlight={row.inFlight}
              isPlayer={row.playerId === userId}
              highlight
            />
          ))}
        </div>

        <div className="scroll-y" style={{ padding: '8px 24px 0' }}>
          {rest.map((row) => (
            <Row
              key={row.playerId}
              place={row.place}
              name={row.name}
              points={row.points}
              inFlight={row.inFlight}
              isPlayer={row.playerId === userId}
            />
          ))}
        </div>

        {pinned && (
          <div style={{ padding: '8px 24px 0', borderTop: '1px solid var(--line-soft)' }}>
            <Row
              place={pinned.place}
              name={pinned.name}
              points={pinned.points}
              inFlight={pinned.inFlight}
              isPlayer
            />
          </div>
        )}

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.5 }}>
            Очки настоящие: сервер начисляет их за пройденные уровни, бустер и вывод.
            Таблица обновляется прямо во время полёта, имена соперников скрыты частично.
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
  inFlight,
  highlight,
}: {
  place: number
  name: string
  points: number
  isPlayer: boolean
  inFlight: boolean
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
      {inFlight && (
        <span className="label" style={{ color: 'var(--amber)', letterSpacing: '.14em' }}>
          в полёте
        </span>
      )}
      <div className="grow" />
      <span className="num" style={{ fontSize: 20, color: isPlayer ? 'var(--amber)' : 'var(--cream)' }}>
        {fmtInt(points)}
      </span>
    </div>
  )
}

/** Деперсонализация имён по ТЗ: первые три символа скрыты. */
const maskName = (name: string) => (name.length <= 3 ? '***' : '***' + name.slice(3))
