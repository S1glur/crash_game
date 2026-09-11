import { useEffect, useState } from 'react'
import { LeaderboardModal } from './components/LeaderboardModal'
import { RulesModal } from './components/RulesModal'
import { BetScreen } from './screens/BetScreen'
import { FlightScreen } from './screens/FlightScreen'
import { ResultScreen } from './screens/ResultScreen'
import { ThemeScreen } from './screens/ThemeScreen'
import { useGame } from './store/gameStore'

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
