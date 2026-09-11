import { Balloon } from '../components/Balloon'
import { Scene } from '../components/Scene'
import { useGame } from '../store/gameStore'
import type { Theme } from '../api/types'
import { fmtInt, fmtMult } from '../utils/format'
import { leaderboard, playerPlace } from '../utils/leaderboard'

export function ThemeScreen() {
  const balance = useGame((s) => s.balance)
  const config = useGame((s) => s.config)
  const betOptions = useGame((s) => s.betOptions)
  const levelsCount = useGame((s) => s.levelsCount)
  const setTheme = useGame((s) => s.setTheme)
  const goToBet = useGame((s) => s.goToBet)
  const totalPoints = useGame((s) => s.totalPoints)

  const rows = leaderboard(totalPoints, 0)

  const choose = (theme: Theme) => {
    setTheme(theme)
    goToBet()
  }

  return (
    <div className="screen">
      <Scene theme="red" />

      <div className="screen-inner">
        <div className="topbar">
          <span className="label">Столото · бонусная игра</span>
          <div className="grow" />
          <span className="chip chip-amber">
            <span style={{ color: 'var(--amber)' }}>Баланс</span>
            <span className="num" style={{ fontSize: 20, letterSpacing: 0 }}>
              {fmtInt(balance)}
            </span>
            <span style={{ fontWeight: 600, opacity: 0.6, letterSpacing: 0, textTransform: 'none' }}>
              бонусов
            </span>
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            marginTop: 8,
            flexShrink: 0,
          }}
        >
          <h1
            className="num"
            style={{
              margin: 0,
              fontWeight: 800,
              fontSize: 'clamp(34px, 5vw, 70px)',
              lineHeight: 1,
              letterSpacing: '-.02em',
              textAlign: 'center',
              textShadow: '0 6px 40px rgba(10,8,24,.7)',
            }}
          >
            Воздушный шар
          </h1>
          <span
            style={{
              fontSize: 'clamp(10px, 1.2vw, 13px)',
              fontWeight: 800,
              letterSpacing: '.24em',
              textTransform: 'uppercase',
              color: 'var(--amber)',
              textAlign: 'center',
            }}
          >
            Выше риск — больше награда
          </span>
        </div>

        <div className="grow" style={{ display: 'flex', alignItems: 'center', minHeight: 0 }}>
          <div className="theme-cards scroll-y" style={{ width: '100%' }}>
            <ThemeCard
              theme="red"
              title="Бордо"
              levels={levelsCount.red}
              thresholds={config?.themes.red.level_thresholds ?? []}
              minBet={Math.min(...(betOptions.red ?? []).map((option) => option.cost), 0) || 0}
              risk={4}
              onSelect={choose}
            />
            <ThemeCard
              theme="green"
              title="Изумруд"
              levels={levelsCount.green}
              thresholds={config?.themes.green.level_thresholds ?? []}
              minBet={Math.min(...(betOptions.green ?? []).map((option) => option.cost), 0) || 0}
              risk={2}
              onSelect={choose}
            />
          </div>
        </div>

        <div
          className="panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            padding: '16px 24px',
            borderColor: 'rgba(242,166,73,.34)',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          <span className="label" style={{ color: 'var(--amber)' }}>
            Турнир
          </span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            Очки за уровни поднимают вас в таблице участников
          </span>
          <div className="grow" />
          <TournamentStat value={fmtInt(totalPoints)} caption="ваши очки" />
          <TournamentStat value={`${playerPlace(rows)}-е`} caption="место" />
          <TournamentStat value="25" caption="дней до конца" accent />
        </div>
      </div>
    </div>
  )
}

function ThemeCard({
  theme,
  title,
  levels,
  thresholds,
  minBet,
  risk,
  onSelect,
}: {
  theme: Theme
  title: string
  levels: number
  thresholds: number[]
  minBet: number
  risk: number
  onSelect: (theme: Theme) => void
}) {
  const accent = theme === 'green' ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)'
  const body = theme === 'green' ? '#2c6b52' : '#8c2f3a'
  const top = thresholds.length ? thresholds[thresholds.length - 1] : 0
  const maxThreshold = top || 1

  return (
    <button className="theme-card" onClick={() => onSelect(theme)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Balloon theme={theme} width={92} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="num" style={{ fontSize: 32, color: accent }}>
            {title}
          </span>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              opacity: 0.66,
            }}
          >
            {levels} уровней · от {fmtInt(minBet)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 2 }}>
            <span className="label" style={{ letterSpacing: '.14em' }}>
              Риск
            </span>
            <div style={{ display: 'flex', gap: 3 }}>
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: 20,
                    height: 6,
                    background: i < risk ? accent : 'rgba(242,234,219,.2)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span className="label" style={{ letterSpacing: '.16em' }}>
            Пороги уровней
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.5 }}>
            {thresholds.length ? `${fmtMult(thresholds[0])} → ${fmtMult(top)}` : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 56 }}>
          {thresholds.map((threshold, index) => (
            <div
              key={index}
              title={`Уровень ${index + 1}: ${fmtMult(threshold)}`}
              style={{
                flexGrow: 1,
                height: `${Math.max(12, (Math.log(threshold) / Math.log(maxThreshold)) * 100)}%`,
                background: index === thresholds.length - 1 ? 'var(--amber)' : body,
              }}
            />
          ))}
        </div>
      </div>

      <div className="hr" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        <TournamentStat value={String(levels)} caption="уровней" />
        <TournamentStat value={top ? fmtMult(top) : '—'} caption="верхний порог" />
        <TournamentStat value={fmtInt(minBet)} caption="мин. ставка" />
      </div>
    </button>
  )
}

function TournamentStat({
  value,
  caption,
  accent,
}: {
  value: string
  caption: string
  accent?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="num" style={{ fontSize: 24, color: accent ? 'var(--amber)' : 'var(--cream)' }}>
        {value}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.52 }}>{caption}</span>
    </div>
  )
}
