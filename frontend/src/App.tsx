import { useEffect, useState } from 'react'
import { LeaderboardModal } from './components/LeaderboardModal'
import { RulesModal } from './components/RulesModal'
import { BetScreen } from './screens/BetScreen'
import { FlightScreen } from './screens/FlightScreen'
import { ResultScreen } from './screens/ResultScreen'
import { ThemeScreen } from './screens/ThemeScreen'
import { useGame } from './store/gameStore'
import { sound } from './utils/sound'

export default function App() {
  const phase = useGame((s) => s.phase)
  const error = useGame((s) => s.error)
  const dismissError = useGame((s) => s.dismissError)
  const init = useGame((s) => s.init)

  const [rulesOpen, setRulesOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <>
      {phase === 'loading' && <Loading />}
      {phase === 'theme' && <ThemeScreen />}
      {phase === 'bet' && (
        <BetScreen
          onOpenRules={() => setRulesOpen(true)}
          onOpenLeaderboard={() => setLeaderboardOpen(true)}
        />
      )}
      {phase === 'flight' && <FlightScreen />}
      {phase === 'result' && <ResultScreen />}

      {phase !== 'loading' && <SoundToggle />}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {leaderboardOpen && <LeaderboardModal onClose={() => setLeaderboardOpen(false)} />}

      {error && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 36,
            transform: 'translateX(-50%)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 20px',
            background: 'var(--ink)',
            border: '1px solid var(--bordeaux-lt)',
            borderRadius: 3,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700 }}>{error}</span>
          <button className="chip" onClick={dismissError}>
            Ок
          </button>
        </div>
      )}
    </>
  )
}

function Loading() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: 'linear-gradient(180deg, #101530 0%, #38315c 60%, #a85c64 100%)',
      }}
    >
      <span className="num" style={{ fontSize: 34 }}>
        Воздушный шар
      </span>
      <span className="label">Готовим полёт…</span>
    </div>
  )
}

/**
 * Переключатель звука. Нужен не только для удобства: на защите проектор
 * обычно уже со звуком, и возможность быстро приглушить игру важнее, чем
 * кажется. Состояние переживает перезагрузку через localStorage.
 */
function SoundToggle() {
  const [muted, setMuted] = useState(sound.muted)

  return (
    <button
      className="chip"
      onClick={() => setMuted(sound.toggleMute())}
      title={muted ? 'Включить звук' : 'Выключить звук'}
      aria-label={muted ? 'Включить звук' : 'Выключить звук'}
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 40,
        width: 38,
        height: 38,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: muted ? 0.55 : 1,
      }}
    >
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 7.5h3L11 4v12L7 12.5H4z" fill="currentColor" stroke="none" />
        {muted ? (
          <path d="M14 7.5l4 5M18 7.5l-4 5" strokeLinecap="round" />
        ) : (
          <>
            <path d="M13.8 7.2a4 4 0 0 1 0 5.6" strokeLinecap="round" />
            <path d="M16.2 5.2a7 7 0 0 1 0 9.6" strokeLinecap="round" />
          </>
        )}
      </svg>
    </button>
  )
}
