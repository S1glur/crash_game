import { useMemo, useState } from 'react'
import { Balloon } from '../components/Balloon'
import { HistoryChart } from '../components/HistoryChart'
import { LootChart } from '../components/LootChart'
import { PuzzleIcon } from '../components/PuzzleIcon'
import { Scene } from '../components/Scene'
import { useGame } from '../store/gameStore'
import { fmtInt } from '../utils/format'

/** Коэффициент, по которому показываем «сколько получится» — медиана истории. */
const REFERENCE_MULTIPLIER = 2

export function BetScreen({
  onOpenRules,
  onOpenLeaderboard,
}: {
  onOpenRules: () => void
  onOpenLeaderboard: () => void
}) {
  const theme = useGame((s) => s.theme)
  const setTheme = useGame((s) => s.setTheme)
  const balance = useGame((s) => s.balance)
  const betOptions = useGame((s) => s.betOptions)
  const levelsCount = useGame((s) => s.levelsCount)
  const selectedBetId = useGame((s) => s.selectedBetId)
  const selectBet = useGame((s) => s.selectBet)
  const startRound = useGame((s) => s.startRound)
  const goToTheme = useGame((s) => s.goToTheme)
  const history = useGame((s) => s.history)
  const config = useGame((s) => s.config)
  const rewards = useGame((s) => s.rewards)

  const [toast, setToast] = useState<string | null>(null)

  const options = betOptions[theme] ?? []
  const selected = options.find((option) => option.id === selectedBetId) ?? null
  const canStart = selected !== null && selected.cost <= balance

  const lootProbabilities = useMemo(() => {
    const themeConfig = config?.themes?.[theme]
    if (!themeConfig) return []
    return Object.entries(themeConfig.loot_probabilities)
      .sort((a, b) => Number(a[0].match(/\d+/)?.[0]) - Number(b[0].match(/\d+/)?.[0]))
      .map(([, value]) => value)
  }, [config, theme])

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 2600)
  }

  return (
    <div className="screen">
      <Scene theme={theme} />

      <div className="screen-inner">
        <div className="topbar">
          <button className="chip" onClick={goToTheme} style={{ letterSpacing: '.1em' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Тема
          </button>
          <span className="num" style={{ fontSize: 24 }}>
            Воздушный шар
          </span>
          <div className="grow" />
          <button className="chip" onClick={onOpenRules}>
            Правила
          </button>
          <button className="chip narrow-hide" onClick={onOpenLeaderboard}>
            Таблица участников
          </button>
          <span className="chip chip-amber">
            <span style={{ color: 'var(--amber)' }}>Баланс</span>
            <span className="num" style={{ fontSize: 20, letterSpacing: 0 }}>
              {fmtInt(balance)}
            </span>
          </span>
        </div>

        <div className="bet-body scroll-y">
          {/* левая колонка */}
          <div className="bet-col">
            <div
              style={{
                position: 'relative',
                flexGrow: 1,
                minHeight: 240,
                overflow: 'hidden',
                border: '1px solid var(--line)',
                borderRadius: 4,
                background:
                  theme === 'green'
                    ? 'linear-gradient(180deg, #1c2240 0%, #35566b 44%, #97a878 82%, #d8b070 100%)'
                    : 'linear-gradient(180deg, #1c2240 0%, #3a335c 38%, #7a4f66 66%, #e8a468 100%)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 18,
                  transform: 'translateX(-50%)',
                }}
              >
                <Balloon theme={theme} width={128} />
              </div>
              <div style={{ position: 'absolute', left: 18, top: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="label">Тема полёта</span>
                <span className="num" style={{ fontSize: 30, color: theme === 'green' ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)' }}>
                  {theme === 'green' ? 'Изумруд' : 'Бордо'}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
                  {levelsCount[theme]} уровней
                </span>
              </div>

              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, display: 'flex', gap: 10 }}>
                <ThemeToggle theme="green" active={theme === 'green'} levels={levelsCount.green} onSelect={setTheme} />
                <ThemeToggle theme="red" active={theme === 'red'} levels={levelsCount.red} onSelect={setTheme} />
              </div>
            </div>

            <HistoryChart items={history} />
          </div>

          {/* правая колонка */}
          <div className="bet-col">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <span className="num" style={{ fontSize: 28 }}>
                Выберите ставку
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.55 }}>
                фрагмент задаёт цену и силу бустера
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {options.map((option) => {
                const affordable = option.cost <= balance
                const isSelected = option.id === selectedBetId
                return (
                  <button
                    key={option.id}
                    className="bet-row"
                    data-selected={isSelected}
                    onClick={() =>
                      affordable ? selectBet(option.id) : showToast('Не хватает бонусов')
                    }
                    aria-pressed={isSelected}
                    style={{ opacity: affordable ? 1 : 0.45 }}
                  >
                    <PuzzleIcon filled={isSelected} size={28} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 15, fontWeight: 800 }}>
                        {option.boostMultiplier > 1 ? `Бустер ×${option.boostMultiplier}` : 'Без бустера'}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.55 }}>
                        {affordable
                          ? option.boostMultiplier > 1
                            ? `умножит коэффициент на ${option.boostMultiplier}`
                            : 'только рост коэффициента'
                          : `не хватает ${fmtInt(option.cost - balance)} бонусов`}
                      </span>
                    </div>
                    <div className="grow" />
                    {isSelected && (
                      <span
                        style={{
                          padding: '5px 11px',
                          background: 'var(--amber)',
                          borderRadius: 2,
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: '.16em',
                          textTransform: 'uppercase',
                          color: 'var(--ink-soft)',
                        }}
                      >
                        Выбрано
                      </span>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <span className="num" style={{ fontSize: 24 }}>
                        {fmtInt(option.cost)}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: isSelected ? 'var(--amber)' : 'rgba(242,234,219,.45)',
                        }}
                      >
                        при ×2,00 → {fmtInt(option.cost * REFERENCE_MULTIPLIER * option.boostMultiplier)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {lootProbabilities.length > 0 && <LootChart probabilities={lootProbabilities} />}

            <div className="grow" />

            <button
              className="btn btn-primary"
              style={{ height: 66 }}
              disabled={!canStart}
              onClick={() => void startRound()}
            >
              Начать полёт
              {selected && (
                <span
                  style={{
                    padding: '5px 12px',
                    background: 'rgba(36,30,54,.18)',
                    borderRadius: 2,
                    fontSize: 13,
                    letterSpacing: 0,
                  }}
                >
                  −{fmtInt(selected.cost)}
                </span>
              )}
            </button>

            <div
              className="panel"
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', flexWrap: 'wrap' }}
            >
              <span className="label">Коллекция</span>
              <div style={{ display: 'flex', gap: 7 }}>
                {Array.from({ length: 6 }, (_, i) => (
                  <PuzzleIcon key={i} filled={i < rewards.length} size={21} />
                ))}
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.5 }}>
                {rewards.length} из 6 — каждый раунд приносит фрагмент
              </span>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 40,
            transform: 'translateX(-50%)',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 22px',
            background: 'var(--ink)',
            border: '1px solid var(--bordeaux-lt)',
            borderRadius: 3,
            animation: 'fadeIn .2s ease',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bordeaux-lt)" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.6v5M12 16.2h.01" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{toast}</span>
        </div>
      )}
    </div>
  )
}

function ThemeToggle({
  theme,
  active,
  levels,
  onSelect,
}: {
  theme: 'green' | 'red'
  active: boolean
  levels: number
  onSelect: (theme: 'green' | 'red') => void
}) {
  const color = theme === 'green' ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)'
  return (
    <button
      onClick={() => onSelect(theme)}
      style={{
        flexGrow: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '11px 15px',
        background: active ? 'rgba(16,13,32,.82)' : 'rgba(16,13,32,.5)',
        border: `1px solid ${active ? color : 'rgba(242,234,219,.2)'}`,
        borderRadius: 3,
        textAlign: 'left',
      }}
    >
      <span style={{ width: 9, height: 9, background: color, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 13, fontWeight: active ? 800 : 700, opacity: active ? 1 : 0.75 }}>
          {theme === 'green' ? 'Изумруд' : 'Бордо'}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.55 }}>{levels} уровней</span>
      </div>
    </button>
  )
}
