import { useEffect, useMemo, useState } from 'react'
import { PuzzleIcon } from '../components/PuzzleIcon'
import { Scene } from '../components/Scene'
import { UpsellModal } from '../components/UpsellModal'
import { useGame } from '../store/gameStore'
import { sound } from '../utils/sound'
import { fmtInt, fmtMult } from '../utils/format'

export function ResultScreen() {
  const result = useGame((s) => s.result)
  const config = useGame((s) => s.config)
  const rewards = useGame((s) => s.rewards)
  const balance = useGame((s) => s.balance)
  const stake = useGame((s) => s.stake)
  const boostOptions = useGame((s) => s.boostOptions)
  const upsellShown = useGame((s) => s.upsellShown)
  const markUpsellShown = useGame((s) => s.markUpsellShown)
  const betWithBoost = useGame((s) => s.betWithBoost)
  const dismissResult = useGame((s) => s.dismissResult)
  const placeBet = useGame((s) => s.placeBet)
  const round = useGame((s) => s.round)

  const [countdown, setCountdown] = useState(0)
  const [upsellOpen, setUpsellOpen] = useState(false)

  /**
   * Что предложить в апсейле: самый сильный бустер, который игрок может
   * оплатить уже зачисленным выигрышем при своей же ставке. Если ни один не
   * по карману — предложения нет, дразнить недоступной покупкой незачем.
   */
  const upsellOption = useMemo(() => {
    if (!result || !config) return null
    if (result.outcome !== 'cashout') return null
    if (result.winAmount < config.upsell.min_win_amount) return null
    return (
      [...boostOptions]
        .filter(
          (option) =>
            option.boostMultiplier > 1 && stake + Math.ceil(stake * option.priceFactor) <= balance,
        )
        .sort((a, b) => b.boostMultiplier - a.boostMultiplier)[0] ?? null
    )
  }, [result, config, boostOptions, stake, balance])

  // Показываем не сразу: сначала дать увидеть свой выигрыш, потом предлагать.
  useEffect(() => {
    if (!upsellOption || upsellShown) return
    const timer = setTimeout(() => {
      setUpsellOpen(true)
      markUpsellShown()
      sound.select()
    }, 1100)
    return () => clearTimeout(timer)
  }, [upsellOption, upsellShown, markUpsellShown])

  /*
    Отсчёт больше не наш: экран закрывает сам цикл раундов, когда открывает
    приём ставок в следующий. Своим таймером мы бы уводили игрока раньше
    времени — и иногда прямо из-под открытого апсейла.
  */
  useEffect(() => {
    if (!round) return
    const tick = () => setCountdown(Math.max(0, Math.ceil((round.phaseEndsAt - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [round])

  const breakdown = useMemo(() => {
    if (!result || !config) return null
    const thresholds = config.themes[result.theme]?.level_thresholds ?? []
    const crashRaw = Number(result.crashPointRaw)
    const levels = thresholds.filter((threshold) => crashRaw >= threshold).length
    const perLine = config.points.points_per_line
    const cashoutBonus = result.outcome === 'cashout' ? config.points.points_cashout_bonus : 0
    const boostBonus = result.points - perLine * levels - cashoutBonus
    return {
      levels,
      levelPoints: perLine * levels,
      cashoutBonus,
      boostBonus: boostBonus > 0 ? boostBonus : 0,
    }
  }, [result, config])

  if (!result) return null

  const won = result.outcome === 'cashout'
  const potential = Math.floor(result.stake * result.crashAt)

  return (
    <div className="screen">
      <Scene theme={result.theme} dimmed />

      <div className="screen-inner" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          className="scroll-y"
          style={{
            width: 'min(1060px, 100%)',
            maxHeight: '100%',
            background: 'var(--panel-strong)',
            border: `1px solid ${won ? 'rgba(242,166,73,.44)' : 'rgba(232,117,127,.5)'}`,
            borderRadius: 5,
            animation: 'fadeIn .35s ease',
          }}
        >
          {/* шапка */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '18px 26px',
              borderBottom: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                padding: '7px 16px',
                background: won ? 'var(--amber)' : 'var(--bordeaux)',
                borderRadius: 2,
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: '.2em',
                textTransform: 'uppercase',
                color: won ? 'var(--ink-soft)' : 'var(--cream)',
              }}
            >
              {won ? 'Победа' : 'Не повезло'}
            </span>
            <span className="label" style={{ letterSpacing: '.14em' }}>
              Раунд {result.roundId} · {result.theme === 'green' ? 'Изумруд' : 'Бордо'}
            </span>
            <div className="grow" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-lt)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7.5 3.4v5.1c0 4.6-3.2 8.8-7.5 10-4.3-1.2-7.5-5.4-7.5-10V6.4L12 3z" />
                <path d="M9 12l2.2 2.2L15.5 10" />
              </svg>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--emerald-lt)',
                }}
              >
                Исход был определён до взлёта
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {/* числа */}
            <div
              style={{
                flex: '1 1 380px',
                padding: '26px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                borderRight: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="label">{won ? 'Выигрыш' : 'Шар лопнул на'}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <span
                    className="num"
                    style={{
                      fontWeight: 800,
                      fontSize: 'clamp(52px, 7vw, 82px)',
                      lineHeight: 1,
                      color: won ? 'var(--cream)' : 'var(--bordeaux-lt)',
                    }}
                  >
                    {won ? fmtInt(result.winAmount) : fmtMult(result.crashAt)}
                  </span>
                  {won && (
                    <span className="num" style={{ fontSize: 24, color: 'var(--emerald-lt)' }}>
                      +{fmtInt(result.winAmount - result.totalPaid)}
                    </span>
                  )}
                </div>
                {!won && (
                  <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.6 }}>
                    {result.boostFee > 0
                      ? `Ставка ${fmtInt(result.stake)} и доплата ${fmtInt(result.boostFee)} за бустер не вернулись`
                      : `Ставка ${fmtInt(result.stake)} бонусов не вернулась`}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Tile value={fmtInt(result.stake)} caption="ставка" />
                {result.boostFee > 0 && <Tile value={fmtInt(result.boostFee)} caption="за бустер" />}
                {won && <Tile value={fmtMult(result.cashedOutAt!)} caption="забрали на" />}
                <Tile value={fmtMult(result.crashAt)} caption="крах" danger />
              </div>

              {breakdown && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  <span className="label">Игровые очки</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ display: 'flex', flexGrow: 1, height: 12, gap: 3 }}>
                      <div style={{ flexGrow: breakdown.levelPoints || 1, background: '#6b5a8e' }} />
                      {breakdown.cashoutBonus > 0 && (
                        <div style={{ flexGrow: breakdown.cashoutBonus, background: 'var(--amber)' }} />
                      )}
                      {breakdown.boostBonus > 0 && (
                        <div style={{ flexGrow: breakdown.boostBonus, background: 'var(--emerald-lt)' }} />
                      )}
                    </div>
                    <span className="num" style={{ fontWeight: 800, fontSize: 30, color: 'var(--amber)' }}>
                      {result.points}
                    </span>
                  </div>
                  <BreakdownRow color="#6b5a8e" label={`${breakdown.levels} уровней × ${config!.points.points_per_line}`} value={breakdown.levelPoints} />
                  <BreakdownRow color="var(--amber)" label="бонус за «Забрать»" value={breakdown.cashoutBonus} />
                  <BreakdownRow color="var(--emerald-lt)" label="бонус за бустер" value={breakdown.boostBonus} />
                </div>
              )}
            </div>

            {/* схема полёта */}
            <div
              style={{
                flex: '1 1 380px',
                padding: '26px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span className="label">Как прошёл полёт</span>
                <div className="grow" />
                {won && <Legend color="var(--cream)" text="вы забрали" />}
                <Legend color="var(--bordeaux-lt)" text="крах" />
              </div>

              <FlightCurve
                crashAt={result.crashAt}
                cashedOutAt={result.cashedOutAt}
                thresholds={config?.themes[result.theme]?.level_thresholds ?? []}
              />

              <div className="hr" />

              <div
                style={{
                  padding: '14px 18px',
                  background: won ? 'rgba(140,47,58,.2)' : 'var(--amber-dim)',
                  border: `1px solid ${won ? 'rgba(232,117,127,.4)' : 'rgba(242,166,73,.42)'}`,
                  borderRadius: 3,
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1.45,
                }}
              >
                {won ? (
                  <>
                    Дождались бы краха — забрали бы{' '}
                    <b className="num" style={{ fontSize: 18 }}>
                      {fmtInt(potential)}
                    </b>
                  </>
                ) : (
                  <>
                    Забрали бы на {fmtMult(Math.max(1.1, result.crashAt * 0.7))} — получили бы{' '}
                    <b className="num" style={{ fontSize: 18 }}>
                      {fmtInt(Math.floor(result.stake * Math.max(1.1, result.crashAt * 0.7)))}
                    </b>
                  </>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  background: 'var(--amber-dim)',
                  border: '1px solid rgba(242,166,73,.42)',
                  borderRadius: 3,
                  flexWrap: 'wrap',
                }}
              >
                <PuzzleIcon filled size={28} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>Награда за раунд</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.6 }}>
                    {result.reward.id} · в коллекции {rewards.length} из 6
                  </span>
                </div>
                <div className="grow" />
                <div style={{ display: 'flex', gap: 5 }}>
                  {Array.from({ length: 6 }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 12,
                        height: 12,
                        background: i < rewards.length ? 'var(--amber)' : 'transparent',
                        border: i < rewards.length ? 'none' : '1px solid rgba(242,234,219,.35)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* кнопки */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '18px 26px',
              borderTop: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}
          >
            <button
              className="btn btn-primary"
              style={{ height: 60, padding: '0 46px' }}
              onClick={dismissResult}
            >
              К ставкам
            </button>
            <button
              className="btn btn-ghost"
              style={{ height: 60, padding: '0 30px' }}
              onClick={() => void placeBet()}
            >
              Повторить · {fmtInt(result.totalPaid)}
            </button>
            <div className="grow" />
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.5 }}>
              {round?.phase === 'RESULT' ? 'Следующий раунд через' : 'Приём ставок ещё'}
            </span>
            <span
              className="num"
              style={{
                width: 34,
                height: 34,
                border: '1px solid rgba(242,234,219,.4)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
              }}
            >
              {countdown}
            </span>
          </div>
        </div>
      </div>

      {upsellOpen && upsellOption && (
        <UpsellModal
          winAmount={result.winAmount}
          option={upsellOption}
          stake={stake}
          balance={balance}
          timeoutSec={config?.upsell.popup_timeout_sec ?? 10}
          onAccept={() => {
            setUpsellOpen(false)
            void betWithBoost(upsellOption.id)
          }}
          onClose={() => setUpsellOpen(false)}
        />
      )}
    </div>
  )
}

/** Кривая коэффициента: экспонента до точки краха, отметки уровней и выхода. */
function FlightCurve({
  crashAt,
  cashedOutAt,
  thresholds,
}: {
  crashAt: number
  cashedOutAt: number | null
  thresholds: number[]
}) {
  const width = 500
  const height = 210
  const top = Math.log(Math.max(crashAt, 1.01))

  const x = (multiplier: number) => (Math.log(Math.max(multiplier, 1)) / top) * (width - 60) + 6
  const y = (multiplier: number) => height - 12 - (Math.log(Math.max(multiplier, 1)) / top) * (height - 40)

  const samples = Array.from({ length: 40 }, (_, i) => {
    const multiplier = Math.exp((top * i) / 39)
    return `${x(multiplier)} ${y(multiplier)}`
  })
  const cutoff = cashedOutAt ?? crashAt
  const solid = samples.filter((_, i) => Math.exp((top * i) / 39) <= cutoff)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 210, display: 'block' }} fill="none">
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <path key={fraction} d={`M0 ${height - 12 - fraction * (height - 40)} h${width}`} stroke="rgba(242,234,219,.1)" strokeWidth="1" />
      ))}

      <path d={`M${solid.join(' L')}`} stroke="var(--amber)" strokeWidth="3" />
      <path d={`M${solid.join(' L')} L${x(cutoff)} ${height - 12} L6 ${height - 12} Z`} fill="var(--amber)" opacity=".14" />
      {cashedOutAt && (
        <path
          d={`M${samples.filter((_, i) => Math.exp((top * i) / 39) >= cashedOutAt).join(' L')}`}
          stroke="var(--bordeaux-lt)"
          strokeWidth="3"
          strokeDasharray="6 5"
        />
      )}

      {thresholds
        .filter((threshold) => threshold <= crashAt)
        .map((threshold) => (
          <circle key={threshold} cx={x(threshold)} cy={y(threshold)} r="3.5" fill="var(--amber)" />
        ))}

      {cashedOutAt && (
        <>
          <line x1={x(cashedOutAt)} y1={y(cashedOutAt)} x2={x(cashedOutAt)} y2={height - 12} stroke="var(--cream)" strokeWidth="1.4" strokeDasharray="4 4" opacity=".6" />
          <circle cx={x(cashedOutAt)} cy={y(cashedOutAt)} r="7" fill="var(--cream)" />
          <text x={x(cashedOutAt) + 12} y={y(cashedOutAt) + 20} fill="var(--cream)" fontFamily="Manrope, sans-serif" fontSize="14" fontWeight="700">
            {fmtMult(cashedOutAt)}
          </text>
        </>
      )}

      <circle cx={x(crashAt)} cy={y(crashAt)} r="7" fill="var(--bordeaux-lt)" />
      <text x={x(crashAt) - 6} y={y(crashAt) - 14} fill="var(--bordeaux-lt)" fontFamily="Manrope, sans-serif" fontSize="14" fontWeight="700">
        {fmtMult(crashAt)}
      </text>
    </svg>
  )
}

function Tile({ value, caption, danger }: { value: string; caption: string; danger?: boolean }) {
  return (
    <div
      style={{
        flexGrow: 1,
        minWidth: 96,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '13px 15px',
        background: danger ? 'rgba(140,47,58,.28)' : 'rgba(242,234,219,.07)',
        borderRadius: 3,
      }}
    >
      <span className="num" style={{ fontSize: 22, color: danger ? 'var(--bordeaux-lt)' : 'var(--cream)' }}>
        {value}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.5 }}>{caption}</span>
    </div>
  )
}

function BreakdownRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, opacity: value > 0 ? 1 : 0.45 }}>
      <span style={{ width: 10, height: 10, background: value > 0 ? color : 'transparent', border: value > 0 ? 'none' : '1px solid rgba(242,234,219,.5)' }} />
      <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.75 }}>{label}</span>
      <div className="grow hr" />
      <span className="num" style={{ fontSize: 16 }}>
        {value}
      </span>
    </div>
  )
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, opacity: 0.5 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      {text}
    </span>
  )
}
