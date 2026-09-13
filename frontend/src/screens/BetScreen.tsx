import { useMemo, useState } from 'react'
import type { BetView, BoostOption, RecentRound, StakeLimits, Theme } from '../api/types'
import { AccountChip } from '../components/AccountChip'
import { RecentRoundsModal } from '../components/RecentRoundsModal'
import type { RoundState } from '../store/gameStore'
import { Balloon } from '../components/Balloon'
import { LootChart } from '../components/LootChart'
import { PuzzleIcon } from '../components/PuzzleIcon'
import { Scene } from '../components/Scene'
import { useCountdown } from '../utils/useCountdown'
import { useGame } from '../store/gameStore'
import { fmtInt, fmtMult, fmtSigned } from '../utils/format'

/** Коэффициент, по которому показываем «сколько получится» — медиана истории. */
const REFERENCE_MULTIPLIER = 2

/** Сколько прошлых полётов помещается в нижнюю полосу, не мельча цифры. */
const STRIP_FLIGHTS = 12

export function BetScreen({
  onOpenRules,
  onOpenTutorial,
  onOpenLeaderboard,
}: {
  onOpenRules: () => void
  onOpenTutorial: () => void
  onOpenLeaderboard: () => void
}) {
  const theme = useGame((s) => s.theme)
  const setTheme = useGame((s) => s.setTheme)
  const balance = useGame((s) => s.balance)
  const stake = useGame((s) => s.stake)
  const setStake = useGame((s) => s.setStake)
  const stakeLimits = useGame((s) => s.stakeLimits)
  const boostOptions = useGame((s) => s.boostOptions)
  const levelsCount = useGame((s) => s.levelsCount)
  const selectedBoostId = useGame((s) => s.selectedBoostId)
  const selectBoost = useGame((s) => s.selectBoost)
  const placeBet = useGame((s) => s.placeBet)
  const cancelBet = useGame((s) => s.cancelBet)
  const round = useGame((s) => s.round)
  const user = useGame((s) => s.user)
  const goToTheme = useGame((s) => s.goToTheme)
  const recentRounds = useGame((s) => s.recentRounds)
  const config = useGame((s) => s.config)
  const rewards = useGame((s) => s.rewards)
  const autoCashout = useGame((s) => s.autoCashout)
  const setAutoCashout = useGame((s) => s.setAutoCashout)
  const topUp = useGame((s) => s.topUp)

  const [toast, setToast] = useState<string | null>(null)
  const [recentOpen, setRecentOpen] = useState(false)

  const selected = boostOptions.find((option) => option.id === selectedBoostId) ?? null
  const boostFee = selected ? Math.ceil(stake * selected.priceFactor) : 0
  const totalCost = stake + boostFee
  /*
    В фазе итога round — это раунд, который уже отыгран, и myBet в нём
    относится к прошлому. Текущей ставкой его считать нельзя: экран предлагал
    бы отменить сыгравшую ставку и не давал поставить заново ровно те секунды,
    когда игрок этого и хочет. Ставка в очереди на следующий раунд — другое
    дело, она настоящая и отменяется.
  */
  const myBet = round && round.phase !== 'RESULT' ? round.myBet : null
  const queuedBet = round?.queuedBet ?? null
  const betting = round?.phase === 'BETTING'
  /*
    Ставку принимаем в любой фазе: если приём закрыт, сервер поставит её в
    очередь на следующий раунд. Иначе одинокий игрок караулил бы нужную секунду.
  */
  const canStart = selected !== null && totalCost <= balance && !myBet && !queuedBet
  const thresholds = config?.themes?.[theme]?.level_thresholds ?? []

  /*
    Уровень, на котором ждёт бустер, экран ставок не называет — хотя сервер
    его знает ещё до взлёта. Знающий игрок иначе просто караулит раунды, где
    бустер выпал низко, и покупает только их: выбор перестаёт быть выбором.
    Маркер бустера появляется уже в полёте, на шкале уровней, как требует
    сценарий 4 ТЗ.

    Из-за этого выплата считается в двух видах: без бустера — то, что игрок
    получит наверняка, и с бустером — если шар дойдёт до его уровня.
  */
  const payoutAtReference = Math.floor(stake * REFERENCE_MULTIPLIER)
  const payoutWithBoost = (option: BoostOption) =>
    Math.floor(stake * REFERENCE_MULTIPLIER * option.boostMultiplier)

  /*
    Потолок ставки зависит от выбранного бустера: за ×4 доплата полторы ставки,
    и на балансе 1000 максимум — 400, а не 1000. Считаем здесь, чтобы ползунок
    не заводил игрока в заведомо отклонённый сервером запрос.
  */
  const maxAffordable = Math.max(
    stakeLimits.min,
    Math.min(stakeLimits.max, Math.floor(balance / (1 + (selected?.priceFactor ?? 0)))),
  )

  /*
    Пополнение демо-баланса. Без него проигранный в ноль баланс запирает игру:
    ТЗ требует, чтобы эксперт прошёл все сценарии сам, а единственным выходом
    оставался бы перезапуск сервера. Кнопка появляется, как только баланс упал
    ниже стартового, а когда не хватает даже на самую дешёвую ставку —
    показываем полноценную плашку, мимо которой не пройти.
  */
  const startingBalance = config?.demo_user?.starting_balance ?? 0
  const canTopUp = balance < startingBalance
  const cheapest = stakeLimits.min
  const stuck = balance < cheapest

  const lootProbabilities = useMemo(() => {
    const themeConfig = config?.themes?.[theme]
    if (!themeConfig) return []
    return Object.entries(themeConfig.loot_probabilities)
      .sort((a, b) => Number(a[0].match(/\d+/)?.[0]) - Number(b[0].match(/\d+/)?.[0]))
      .map(([, value]) => value)
  }, [config, theme])

  /*
    Полёты своей темы. Список приходит по всем темам сразу, а у зелёной и
    красной разное число уровней и разные пороги — смешивать их в одной
    полосе значит сравнивать несравнимое.
  */
  const themeFlights = useMemo(
    () => recentRounds.filter((flight) => flight.theme === theme),
    [recentRounds, theme],
  )

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 7000)
  }

  const themeColor = theme === 'green' ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)'

  return (
    <div className="screen">
      {/* Сцена размыта: поверх неё лежит карточка с цифрами, и резкий фон спорил с ней. */}
      <div className="bet-scene">
        <Scene theme={theme} />
      </div>

      <div className="screen-inner">
        {/*
          Шапка из трёх зон равной ширины: заголовок стоит ровно по центру
          экрана независимо от того, сколько места заняли кнопки слева и справа.
          При простом flex с распоркой он уезжал влево вслед за кнопкой «Тема».
        */}
        <div className="topbar topbar-3">
          <div className="topbar-side">
            <AccountChip />
            <button className="chip" onClick={goToTheme} style={{ letterSpacing: '.1em' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Тема
            </button>
          </div>

          <span className="head topbar-title" style={{ fontSize: 30 }}>
            Воздушный шар
          </span>

          <div className="topbar-side topbar-side-end">
            <button className="chip chip-amber" onClick={onOpenTutorial}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.6 9.4a2.5 2.5 0 1 1 3.2 2.4c-.6.2-.8.7-.8 1.3v.4" />
                <path d="M12 16.8h.01" />
              </svg>
              Обучение
            </button>
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
          {/* слева — сцена: шар, под ним выбор темы и справочные панели */}
          <div className="bet-stage">
            <div className="bet-balloon">
              <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label">Тема полёта</span>
                <span className="head" style={{ fontSize: 34, color: themeColor }}>
                  {theme === 'green' ? 'Изумруд' : 'Бордо'}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.65 }}>
                  {levelsCount[theme]} уровней
                </span>
              </div>

              <Balloon theme={theme} width={168} />
            </div>

            <div className="theme-row">
              <ThemePick theme="green" active={theme === 'green'} levels={levelsCount.green} onSelect={setTheme} />
              <ThemePick theme="red" active={theme === 'red'} levels={levelsCount.red} onSelect={setTheme} />
            </div>

            {round && <Participants bets={round.bets} meId={user?.id} />}

            {lootProbabilities.length > 0 && <LootChart probabilities={lootProbabilities} />}
          </div>

          {/* справа — одна карточка: всё, что игрок делает, лежит в ней */}
          <div className="bet-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span className="head" style={{ fontSize: 30 }}>
                Ставка
              </span>
              <div className="grow" />
              {round && <PhasePill round={round} />}
            </div>

            {stuck && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 18px',
                  background: '#3a2029',
                  borderRadius: 'var(--r-md)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>Бонусы закончились</span>
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.72, lineHeight: 1.5 }}>
                    На балансе {fmtInt(balance)}, самая дешёвая ставка — {fmtInt(cheapest)}.
                    Демо-счёт можно пополнить до {fmtInt(startingBalance)}.
                  </span>
                </div>
                <button className="btn btn-primary" style={{ height: 48, padding: '0 24px' }} onClick={() => void topUp()}>
                  Пополнить счёт
                </button>
              </div>
            )}

            <StakeInput
              value={stake}
              onChange={setStake}
              limits={stakeLimits}
              maxAffordable={maxAffordable}
            />

            <div className="bet-sep" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <span className="label">Бустер · умножит выигрыш, если шар дойдёт до него</span>

              <div className="boost-grid">
                {boostOptions.map((option) => {
                  const fee = Math.ceil(stake * option.priceFactor)
                  const affordable = stake + fee <= balance
                  const isSelected = option.id === selectedBoostId
                  const payout = option.boostMultiplier > 1 ? payoutWithBoost(option) : payoutAtReference
                  return (
                    <button
                      key={option.id}
                      className="boost-tile"
                      data-selected={isSelected}
                      aria-pressed={isSelected}
                      title={
                        option.boostMultiplier > 1
                          ? `Доплата ${fmtInt(fee)}. Если шар дойдёт до бустера, выигрыш умножится на ${option.boostMultiplier}`
                          : 'Только рост коэффициента, без доплаты'
                      }
                      onClick={() =>
                        affordable ? selectBoost(option.id) : showToast('Не хватает бонусов')
                      }
                      style={{ opacity: affordable ? 1 : 0.45 }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 800 }}>
                        {option.boostMultiplier > 1 ? `×${option.boostMultiplier}` : 'Без'}
                      </span>
                      <span className="num" style={{ fontSize: 22, lineHeight: 1 }}>
                        {fee > 0 ? `+${fmtInt(fee)}` : '—'}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: !affordable
                            ? 'var(--bordeaux-lt)'
                            : isSelected
                              ? 'var(--amber)'
                              : 'rgba(242,234,219,.45)',
                        }}
                      >
                        {affordable
                          ? `→ ${fmtInt(payout)}`
                          : `не хватает ${fmtInt(stake + fee - balance)}`}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Из чего складывается списание и что вернётся — иначе доплата выглядит скрытой. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, fontWeight: 600, opacity: 0.62, flexWrap: 'wrap' }}>
                <span>
                  при ×{fmtMult(REFERENCE_MULTIPLIER)} вернётся {fmtInt(payoutAtReference)}
                  {selected && selected.boostMultiplier > 1
                    ? `, с бустером ${fmtInt(payoutWithBoost(selected))}`
                    : ''}
                  {' · чистыми '}
                  {fmtSigned(payoutAtReference - totalCost)}
                </span>
                {boostFee > 0 && (
                  <>
                    <div className="grow hr" />
                    <span>
                      ставка {fmtInt(stake)} + бустер за {fmtInt(boostFee)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <AutoCashout
              value={autoCashout}
              onChange={setAutoCashout}
              minimum={thresholds[0] ?? 1.1}
              bet={stake}
              boostMultiplier={selected?.boostMultiplier ?? 1}
            />

            <div className="grow" />

            {myBet || queuedBet ? (
              <button
                className="btn btn-ghost"
                style={{ height: 62, flexShrink: 0 }}
                onClick={() => void cancelBet()}
              >
                Отменить ставку · вернём {fmtInt((myBet ?? queuedBet)!.totalPaid)}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ height: 62, flexShrink: 0 }}
                disabled={!canStart}
                onClick={() => void placeBet()}
              >
                {betting ? 'Поставить' : 'В очередь на следующий раунд'}
                {selected && (
                  <span className="num" style={{ fontSize: 20, letterSpacing: 0 }}>
                    −{fmtInt(totalCost)}
                  </span>
                )}
              </button>
            )}

            {queuedBet && (
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--amber)', lineHeight: 1.4 }}>
                Ставка принята в следующий раунд — приём в этот уже был закрыт.
              </span>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px',
                background: 'var(--surface-2)',
                borderRadius: 'var(--r-md)',
                flexWrap: 'wrap',
              }}
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

        <div className="bet-strip">
          <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="label">Прошлые полёты · новые слева</span>
              <div className="grow" />
              {round && (
                <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.5 }}>
                  {round.roundId} · участников {round.betCount}
                </span>
              )}
              <button className="chip chip-sm" onClick={() => setRecentOpen(true)}>
                Недавние
              </button>
            </div>

            <FlightStrip flights={themeFlights} />
          </div>
        </div>
      </div>

      {recentOpen && <RecentRoundsModal onClose={() => setRecentOpen(false)} />}

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
            background: 'var(--panel-strong)',
            borderRadius: 999,
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

/**
 * Цвет плашки по величине коэффициента.
 *
 * Цвет здесь не украшение: полоса читается боковым зрением, и по её тону
 * видно, как шла игра последние минуты, ещё до того как прочитаны цифры.
 * Ранний крах уходит в красное, долгий полёт — в янтарь.
 */
function tone(value: number): { bg: string; ink: string } {
  if (value >= 3) return { bg: '#4a3a1c', ink: '#f7c473' }
  if (value >= 2) return { bg: '#3d2c33', ink: '#f0a76b' }
  if (value >= 1.3) return { bg: '#272045', ink: '#a79ce0' }
  return { bg: '#3a2029', ink: '#f08e97' }
}

/**
 * Прошлые полёты плашками: коэффициент раунда и цвет по его величине.
 *
 * Раньше здесь стояла гистограмма со средним, медианой и долей выше 2,00.
 * Она отвечала на вопрос, которого игрок не задаёт: перед ставкой важно не
 * распределение, а то, что происходило только что. Считается по РАУНДАМ, а не
 * по ставкам — раунд с тремя участниками остаётся одной плашкой.
 */
function FlightStrip({ flights }: { flights: RecentRound[] }) {
  const shown = flights.slice(0, STRIP_FLIGHTS)

  if (shown.length === 0) {
    return (
      <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.5 }}>
        Ещё никто не летал — ваш раунд будет первым в истории.
      </span>
    )
  }

  return (
    <div className="flight-chips">
      {shown.map((flight) => {
        const { bg, ink } = tone(flight.crashAt)
        return (
          <span
            key={flight.roundId}
            className="flight-chip num"
            title={`${flight.roundId} · участников ${flight.betCount}`}
            style={{ background: bg, color: ink }}
          >
            {fmtMult(flight.crashAt)}×
          </span>
        )
      })}
    </div>
  )
}

/**
 * Выбор темы прямо под шаром: плашка меняет то, что нарисовано выше.
 *
 * Полный экран выбора с описаниями никуда не делся — он открывается кнопкой
 * «Тема» в шапке; здесь быстрый переключатель для тех, кто уже знает разницу.
 */
function ThemePick({
  theme,
  active,
  levels,
  onSelect,
}: {
  theme: Theme
  active: boolean
  levels: number
  onSelect: (theme: Theme) => void
}) {
  const color = theme === 'green' ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)'
  return (
    <button
      className="theme-pick"
      data-active={active}
      aria-pressed={active}
      onClick={() => onSelect(theme)}
      style={{ borderColor: active ? color : undefined }}
    >
      <span style={{ width: 12, height: 12, borderRadius: 4, background: color, flexShrink: 0 }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 800, opacity: active ? 1 : 0.72 }}>
          {theme === 'green' ? 'Изумруд' : 'Бордо'}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.55 }}>{levels} уровней</span>
      </span>
    </button>
  )
}

/**
 * Ввод суммы ставки: крупное число, ползунок и пресеты.
 *
 * Ползунок ограничен не только конфигом, но и балансом с учётом доплаты за
 * выбранный бустер — иначе игрок выставлял бы сумму, которую сервер всё равно
 * отклонит, и узнавал бы об этом только по ошибке после нажатия «Поставить».
 */
function StakeInput({
  value,
  onChange,
  limits,
  maxAffordable,
}: {
  value: number
  onChange: (value: number) => void
  limits: StakeLimits
  maxAffordable: number
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (raw: string) => {
    const parsed = Number(raw.replace(/[^\d]/g, ''))
    if (Number.isFinite(parsed) && parsed > 0) onChange(Math.min(parsed, maxAffordable))
    setDraft(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="label">Сумма ставки</span>
        <div className="grow" />
        <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.45 }}>
          от {fmtInt(limits.min)} до {fmtInt(maxAffordable)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <input
          className="num"
          inputMode="numeric"
          value={draft ?? String(value)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
          }}
          aria-label="Сумма ставки в баллах"
          style={{
            width: 150,
            padding: '6px 12px',
            background: 'var(--surface-2)',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            color: 'var(--cream)',
            fontSize: 42,
            textAlign: 'center',
            outline: 'none',
          }}
        />

        <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 4 }}>
          <input
            type="range"
            min={limits.min}
            max={maxAffordable}
            step={limits.step}
            value={Math.min(value, maxAffordable)}
            onChange={(event) => onChange(Number(event.target.value))}
            aria-label="Ползунок суммы ставки"
            style={{ width: '100%', accentColor: 'var(--amber)' }}
          />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {limits.presets
              .filter((preset) => preset <= maxAffordable)
              .map((preset) => (
                <button
                  key={preset}
                  className="chip chip-sm"
                  onClick={() => onChange(preset)}
                  aria-pressed={value === preset}
                  style={
                    value === preset
                      ? { background: 'var(--amber)', color: 'var(--ink-soft)' }
                      : undefined
                  }
                >
                  {fmtInt(preset)}
                </button>
              ))}
            <button className="chip chip-sm" onClick={() => onChange(maxAffordable)}>
              Максимум
            </button>
          </div>
        </div>
      </div>
    </div>
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
  const pick = (active: boolean) =>
    active ? { background: 'var(--amber)', color: 'var(--ink-soft)' } : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="label">Автовывод</span>

        <button
          className="chip chip-sm"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          style={pick(value === null)}
        >
          Выкл
        </button>

        {presets
          .filter((preset) => preset >= minimum)
          .map((preset) => (
            <button
              key={preset}
              className="chip chip-sm"
              onClick={() => onChange(preset)}
              aria-pressed={value === preset}
              style={pick(value === preset)}
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
          aria-label="Свой порог автовывода"
          onChange={(e) => {
            const parsed = Number(e.target.value)
            onChange(e.target.value === '' || Number.isNaN(parsed) ? null : parsed)
          }}
          style={{
            width: 72,
            font: 'inherit',
            fontWeight: 700,
            fontSize: 11,
            padding: '6px 10px',
            background: 'var(--surface-2)',
            color: 'var(--cream)',
            border: 'none',
            borderRadius: 999,
            outline: 'none',
          }}
        />
      </div>

      <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.55, lineHeight: 1.4 }}>
        {value === null
          ? 'Выключен — забирать вручную, пока шар не лопнул.'
          : bet > 0
            ? `На ×${value.toFixed(2).replace('.', ',')} получите ${fmtInt(Math.floor(bet * value))}` +
              (boostMultiplier > 1 ? ' · с бустером порог возьмём раньше' : '')
            : `Минимум — ×${minimum.toFixed(2).replace('.', ',')} (первый уровень).`}
      </span>
    </div>
  )
}

/**
 * Состояние общего раунда в шапке карточки: сколько секунд до взлёта.
 *
 * Цикл идёт непрерывно и без игроков, поэтому обратный отсчёт — главный
 * ориентир экрана: по нему видно, успеваешь ли ты в этот раунд.
 */
function PhasePill({ round }: { round: RoundState }) {
  const left = useCountdown(round.phaseEndsAt)
  const betting = round.phase === 'BETTING'

  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 16px',
        background: 'var(--surface-2)',
        borderRadius: 999,
      }}
    >
      {betting ? (
        <>
          <span className="num" style={{ fontSize: 20, color: 'var(--amber)' }}>
            {left}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.8 }}>
            {/* На нуле приём уже закрыт, а событие о взлёте ещё в пути — */}
            {/* «0 сек до взлёта» в этот момент читается как зависший экран. */}
            {left > 0 ? 'сек до взлёта' : 'взлетаем'}
          </span>
        </>
      ) : (
        <>
          <span className="num" style={{ fontSize: 20 }}>
            {fmtMult(round.crashAt ?? round.serverMultiplier)}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.8 }}>
            {round.phase === 'FLYING' ? 'шар в воздухе' : 'раунд завершён'}
          </span>
        </>
      )}
    </span>
  )
}

/** Кто уже в раунде. Тот же список виден и во время полёта. */
function Participants({ bets, meId }: { bets: BetView[]; meId?: string }) {
  if (bets.length === 0) {
    return (
      <div className="panel" style={{ padding: '12px 16px', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.5 }}>
          В этом раунде пока никого — станьте первым.
        </span>
      </div>
    )
  }

  return (
    <div className="panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
      <span className="label">В раунде · {bets.length}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 108, overflowY: 'auto' }}>
        {bets.map((bet) => (
          <div
            key={bet.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              fontWeight: 600,
              opacity: bet.playerId === meId ? 1 : 0.72,
            }}
          >
            <span style={{ color: bet.playerId === meId ? 'var(--amber)' : undefined }}>
              {bet.player}
              {bet.playerId === meId ? ' · вы' : ''}
            </span>
            {bet.boostTier > 1 && (
              <span style={{ fontSize: 10.5, opacity: 0.7 }}>×{bet.boostMultiplier}</span>
            )}
            <div className="grow hr" />
            <span className="num" style={{ fontSize: 14 }}>
              {fmtInt(bet.stake)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
