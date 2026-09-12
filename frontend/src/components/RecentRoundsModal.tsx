import { useEffect, useState } from 'react'
import { useGame } from '../store/gameStore'
import { fmtInt, fmtMult } from '../utils/format'

/**
 * Недавние раунды со списком участников.
 *
 * В списке есть и раунды, где никто не играл: цикл крутится сам по себе, и
 * пропусти мы их — он выглядел бы прерывистым, будто раунды случаются только
 * когда кто-то поставил.
 */
export function RecentRoundsModal({ onClose }: { onClose: () => void }) {
  const rounds = useGame((s) => s.recentRounds)
  const load = useGame((s) => s.loadRecentRounds)
  const meId = useGame((s) => s.user?.id)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ width: 'min(760px, 100%)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '16px 22px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span className="num" style={{ fontSize: 22 }}>
            Недавние раунды
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.5 }}>
            нажмите на раунд, чтобы увидеть участников
          </span>
          <div className="grow" />
          <button className="chip" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="scroll-y" style={{ padding: '14px 18px 20px' }}>
          {rounds.length === 0 && (
            <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.5 }}>Загружаем…</span>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rounds.map((round) => {
              const open = openId === round.roundId
              const mine = round.participants.some((bet) => bet.playerId === meId)
              return (
                <div
                  key={round.roundId}
                  style={{
                    border: `1px solid ${mine ? 'rgba(242,166,73,.42)' : 'var(--line)'}`,
                    borderRadius: 3,
                    background: 'rgba(16,13,32,.4)',
                  }}
                >
                  <button
                    onClick={() => setOpenId(open ? null : round.roundId)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '11px 14px',
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'left',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: round.theme === 'green' ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)',
                        flexShrink: 0,
                      }}
                    />
                    <span className="num" style={{ fontSize: 19, minWidth: 74 }}>
                      {fmtMult(round.crashAt)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.5, minWidth: 52 }}>
                      {round.roundId}
                    </span>
                    <div className="grow" />
                    <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.7 }}>
                      {round.betCount === 0
                        ? 'без участников'
                        : `${round.betCount} ${round.betCount === 1 ? 'участник' : 'участников'}`}
                    </span>
                    {round.betCount > 0 && (
                      <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.7 }}>
                        касса {fmtInt(round.totalStake)} → выплачено{' '}
                        <b style={{ color: round.totalWin > round.totalStake ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)' }}>
                          {fmtInt(round.totalWin)}
                        </b>
                      </span>
                    )}
                  </button>

                  {open && round.participants.length > 0 && (
                    <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div className="hr" />
                      {round.participants.map((bet) => (
                        <div
                          key={bet.playerId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: 12,
                            fontWeight: 600,
                            opacity: bet.playerId === meId ? 1 : 0.78,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ color: bet.playerId === meId ? 'var(--amber)' : undefined, minWidth: 96 }}>
                            {bet.player}
                            {bet.playerId === meId ? ' · вы' : ''}
                          </span>
                          <span style={{ opacity: 0.7 }}>
                            ставка {fmtInt(bet.stake)}
                            {bet.boostFee > 0 ? ` + ${fmtInt(bet.boostFee)} за ×${bet.boostTier}` : ''}
                          </span>
                          <div className="grow hr" />
                          {/*
                            Исход назван словом, а не цветом: пара зелёный/бордовый
                            почти неразличима при дейтеранопии.
                          */}
                          {bet.outcome === 'cashout' ? (
                            <span style={{ color: 'var(--emerald-lt)' }}>
                              забрал ×{fmtMult(bet.cashedOutAt ?? 0)} → {fmtInt(bet.winAmount)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--bordeaux-lt)' }}>не успел</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {open && round.participants.length === 0 && (
                    <div style={{ padding: '0 14px 12px' }}>
                      <div className="hr" style={{ marginBottom: 8 }} />
                      <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.5 }}>
                        Раунд прошёл без ставок — цикл идёт независимо от игроков.
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
