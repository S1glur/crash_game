import { useEffect, useState } from 'react'
import { AdminModal } from './components/AdminModal'
import { FairPlayModal } from './components/FairPlayModal'
import { LeaderboardModal } from './components/LeaderboardModal'
import { RulesModal } from './components/RulesModal'
import { TutorialModal } from './components/TutorialModal'
import { AuthScreen } from './screens/AuthScreen'
import { BetScreen } from './screens/BetScreen'
import { FlightScreen } from './screens/FlightScreen'
import { ReportScreen } from './screens/ReportScreen'
import { ResultScreen } from './screens/ResultScreen'
import { ThemeScreen } from './screens/ThemeScreen'
import { useGame } from './store/gameStore'
import { sound } from './utils/sound'

/**
 * Сколько живёт уведомление, прежде чем уйти само.
 *
 * Раньше сообщение об ошибке висело до нажатия «Ок» и перекрывало нижнюю
 * часть экрана, пока игрок про него не вспомнит. Семь секунд — столько,
 * чтобы успеть дочитать длинную фразу вроде «ставка возможна от 100 до 400
 * баллов», и не дольше.
 */
const NOTICE_LIFETIME_MS = 7000

export default function App() {
  const phase = useGame((s) => s.phase)
  const error = useGame((s) => s.error)
  const dismissError = useGame((s) => s.dismissError)
  const init = useGame((s) => s.init)

  const [rulesOpen, setRulesOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [fairOpen, setFairOpen] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  // Уведомление уходит само. Кнопка «Ок» остаётся: закрыть раньше срока
  // иногда нужно, а ждать семь секунд ради этого — нет.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(dismissError, NOTICE_LIFETIME_MS)
    return () => clearTimeout(timer)
  }, [error, dismissError])

  // Ветер и редкие птицы фоном на всё время игры (§1.1 ТЗ). Держим на уровне
  // приложения, иначе атмосфера обрывалась бы на каждом переходе между экранами.
  useEffect(() => {
    sound.startAmbience()
    return () => sound.stopAmbience()
  }, [])

  return (
    <>
      {phase === 'loading' && <Loading />}
      {phase === 'auth' && <AuthScreen />}
      {phase === 'theme' && <ThemeScreen />}
      {phase === 'bet' && (
        <BetScreen
          onOpenRules={() => setRulesOpen(true)}
          onOpenTutorial={() => setTutorialOpen(true)}
          onOpenLeaderboard={() => setLeaderboardOpen(true)}
          onOpenFairPlay={() => setFairOpen(true)}
        />
      )}
      {phase === 'flight' && <FlightScreen onOpenFairPlay={() => setFairOpen(true)} />}
      {phase === 'result' && <ResultScreen />}
      {phase === 'report' && <ReportScreen />}

      {phase !== 'loading' && phase !== 'auth' && (
        <CornerControls onOpenAdmin={() => setAdminOpen(true)} />
      )}

      {tutorialOpen && <TutorialModal onClose={() => setTutorialOpen(false)} />}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {leaderboardOpen && <LeaderboardModal onClose={() => setLeaderboardOpen(false)} />}
      {adminOpen && <AdminModal onClose={() => setAdminOpen(false)} />}
      {fairOpen && <FairPlayModal onClose={() => setFairOpen(false)} />}

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
 * Постоянный угол управления: настройки игры и звук.
 *
 * Аккаунт отсюда уехал в шапку экрана (AccountChip) — под кем зашли, видно
 * первым делом, слева сверху. Здесь остаётся то, что нужно редко и не должно
 * тянуть на себя внимание.
 *
 * Звук вынесен сюда не только для удобства: на защите проектор обычно уже со
 * звуком, и возможность быстро приглушить игру важнее, чем кажется. Состояние
 * переживает перезагрузку через localStorage.
 */
function CornerControls({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const [muted, setMuted] = useState(sound.muted)
  const user = useGame((s) => s.user)
  const openReport = useGame((s) => s.openReport)

  const buttonStyle: React.CSSProperties = {
    width: 38,
    height: 38,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/* Отчётность и экономика игры — только администратору; сервер всё равно откажет остальным. */}
      {user?.role === 'ADMIN' && (
        <button
          className="chip chip-admin"
          onClick={openReport}
          title="Отчётность для администратора"
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M3 16.5h14" strokeLinecap="round" />
            <path d="M5.5 16.5v-5M9.2 16.5V5.5M12.9 16.5v-7.5M16.5 16.5v-3.5" strokeLinecap="round" />
          </svg>
          <span className="admin-tag">admin</span>
          Отчётность
        </button>
      )}

      {user?.role === 'ADMIN' && (
        <button
          className="chip chip-admin"
          onClick={onOpenAdmin}
          title="Параметры игры — применятся у всех игроков"
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="10" cy="10" r="2.6" />
            <path d="M10 2.4v2M10 15.6v2M17.6 10h-2M4.4 10h-2M15.4 4.6l-1.4 1.4M6 14l-1.4 1.4M15.4 15.4L14 14M6 6L4.6 4.6" strokeLinecap="round" />
          </svg>
          <span className="admin-tag">admin</span>
          Настройки раундов
        </button>
      )}

      <button
        className="chip"
        onClick={() => setMuted(sound.toggleMute())}
        title={muted ? 'Включить звук' : 'Выключить звук'}
        aria-label={muted ? 'Включить звук' : 'Выключить звук'}
        style={{ ...buttonStyle, opacity: muted ? 0.55 : 1 }}
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
    </div>
  )
}
