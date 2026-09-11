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
  const autoCashout = useGame((s) => s.autoCashout)
  const setAutoCashout = useGame((s) => s.setAutoCashout)
  const topUp = useGame((s) => s.topUp)

  const [toast, setToast] = useState<string | null>(null)

  const options = betOptions[theme] ?? []
  const selected = options.find((option) => option.id === selectedBetId) ?? null
  const canStart = selected !== null && selected.cost <= balance
  const thresholds = config?.themes?.[theme]?.level_thresholds ?? []

  /*
    Пополнение демо-баланса. Без него проигранный в ноль баланс запирает игру:
    ТЗ требует, чтобы эксперт прошёл все сценарии сам, а единственным выходом
    оставался бы перезапуск сервера. Кнопка появляется, как только баланс упал
    ниже стартового, а когда не хватает даже на самую дешёвую ставку —
    показываем полноценную плашку, мимо которой не пройти.
  */
  const startingBalance = config?.demo_user?.starting_balance ?? 0
  const canTopUp = balance < startingBalance
  const cheapest = options.length ? Math.min(...options.map((option) => option.cost)) : 0
  const stuck = options.length > 0 && balance < cheapest

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
        {/*
          Шапка из трёх зон равной ширины: заголовок стоит ровно по центру
          экрана независимо от того, сколько места заняли кнопки слева и справа.
          При простом flex с распоркой он уезжал влево вслед за кнопкой «Тема».
        */}
        <div className="topbar topbar-3">
          <div className="topbar-side">
            <button className="chip" onClick={goToTheme} style={{ letterSpacing: '.1em' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Тема
            </button>
          </div>

          <span className="num topbar-title" style={{ fontSize: 24 }}>
            Воздушный шар
          </span>

          <div className="topbar-side topbar-side-end">
            <button className="chip" onClick={onOpenRules}>
              Правила
            </button>
            <button className="chip" onClick={onOpenLeaderboard} title="Таблица участников">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 4h12v2h3v3a4 4 0 0 1-3.6 4A5 5 0 0 1 13 16.9V19h3v2H8v-2h3v-2.1A5 5 0 0 1 6.6 13 4 4 0 0 1 3 9V6h3zM5 8v1a2 2 0 0 0 1 1.7V8zm14 0h-2v2.7A2 2 0 0 0 19 9z" />
              </svg>
              <span className="narrow-hide">Таблица участников</span>
            </button>
            <span className="chip chip-amber">
              <span style={{ color: 'var(--amber)' }}>Баланс</span>
              <span className="num" style={{ fontSize: 20, letterSpacing: 0 }}>
                {fmtInt(balance)}
              </span>
            </span>
            {canTopUp && (
              <button
                className="chip"
                onClick={() => void topUp()}
                title={`Пополнить демо-баланс до ${fmtInt(startingBalance)}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span className="narrow-hide">Пополнить</span>
              </button>
            )}
          </div>
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
              {/*
                Шар поднят над плашками выбора темы: те прижаты к низу
                (bottom: 14) и при bottom: 18 корзина шара их перекрывала.
                Запас взят с учётом того, что шар ещё и покачивается на 15px.
              */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 104,
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

            {stuck && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 18px',
                  background: 'rgba(140,47,58,.24)',
                  border: '1px solid rgba(232,117,127,.5)',
                  borderRadius: 3,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px' }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>Бонусы закончились</span>
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, lineHeight: 1.5 }}>
                    На балансе {fmtInt(balance)}, самая дешёвая ставка — {fmtInt(cheapest)}.
                    Демо-счёт можно пополнить до {fmtInt(startingBalance)}.
                  </span>
                </div>
                <button className="btn btn-primary" style={{ height: 50, padding: '0 26px' }} onClick={() => void topUp()}>
                  Пополнить счёт
                </button>
              </div>
            )}

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

            <AutoCashout
              value={autoCashout}
              onChange={setAutoCashout}
              minimum={thresholds[0] ?? 1.1}
              bet={selected?.cost ?? 0}
              boostMultiplier={selected?.boostMultiplier ?? 1}
            />

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
        flex: '1 1 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 11,
        padding: '11px 15px',
        background: active ? 'rgba(16,13,32,.82)' : 'rgba(16,13,32,.5)',
        border: `1px solid ${active ? color : 'rgba(242,234,219,.2)'}`,
        borderRadius: 3,
        textAlign: 'center',
      }}
    >
      <span style={{ width: 9, height: 9, background: color, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 13, fontWeight: active ? 800 : 700, opacity: active ? 1 : 0.75 }}>
          {theme === 'green' ? 'Изумруд' : 'Бордо'}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.55 }}>{levels} уровней</span>
      </div>
    </button>
  )
}

/**
 * Автовывод: игрок заранее называет коэффициент, на котором сервер сам
 * зафиксирует выигрыш. Смысл не в удобстве, а в психологии crash-игр — решение,
 * принятое заранее и на холодную голову, спасает от «ещё чуть-чуть», из-за
 * которого ставка и сгорает.
 *
 * Порог хранится и проверяется на сервере: иначе он зависел бы от лагов вкладки
 * и не сработал бы на свёрнутой странице.
 */
function AutoCashout({
  value,
  onChange,
  minimum,
  bet,
  boostMultiplier,
}: {
  value: number | null
  onChange: (value: number | null) => void
  minimum: number
  bet: number
  boostMultiplier: number
}) {
  const presets = [1.5, 2, 3, 5]

  return (
    <div className="panel" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="label">Автовывод</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.55 }}>
          заберём сами на этом коэффициенте
        </span>
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <button
          className="chip"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          style={{
            borderColor: value === null ? 'var(--amber)' : undefined,
            color: value === null ? 'var(--amber)' : undefined,
          }}
        >
          Выкл
        </button>

        {presets
          .filter((preset) => preset >= minimum)
          .map((preset) => (
            <button
              key={preset}
              className="chip"
              onClick={() => onChange(preset)}
              aria-pressed={value === preset}
              style={{
                borderColor: value === preset ? 'var(--amber)' : undefined,
                color: value === preset ? 'var(--amber)' : undefined,
              }}
            >
              ×{preset.toFixed(2).replace('.', ',')}
            </button>
          ))}

        <input
          type="number"
          min={minimum}
          step={0.1}
          value={value ?? ''}
          placeholder="свой"
          onChange={(e) => {
            const parsed = Number(e.target.value)
            onChange(e.target.value === '' || Number.isNaN(parsed) ? null : parsed)
          }}
          style={{
            width: 84,
            font: 'inherit',
            fontWeight: 700,
            fontSize: 12,
            padding: '6px 9px',
            background: 'rgba(16,13,32,.6)',
            color: 'var(--cream)',
            border: '1px solid var(--line)',
            borderRadius: 2,
          }}
        />
      </div>

      <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.66, lineHeight: 1.45 }}>
        {value === null
          ? 'Выключен — забирать нужно вручную, пока шар не лопнул.'
          : bet > 0
            ? `На ×${value.toFixed(2).replace('.', ',')} получите ${fmtInt(
                Math.floor(bet * value),
              )}. Если сработает бустер ×${boostMultiplier}, порог будет достигнут раньше.`
            : `Сработает на ×${value.toFixed(2).replace('.', ',')}, если шар долетит. Минимум — ×${minimum
                .toFixed(2)
                .replace('.', ',')} (первый уровень).`}
      </span>
    </div>
  )
}
