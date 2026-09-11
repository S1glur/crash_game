import { useEffect, useMemo, useRef, useState } from 'react'
import { Altimeter } from '../components/Altimeter'
import { Balloon } from '../components/Balloon'
import { LeaderStrip } from '../components/LeaderStrip'
import { Scene } from '../components/Scene'
import { useGame } from '../store/gameStore'
import { fmtInt, fmtMult, levelProgress } from '../utils/format'

/** Пикселей подъёма сцены на один пройденный уровень. */
const LIFT_PER_LEVEL = 46

export function FlightScreen() {
  const flight = useGame((s) => s.flight)
  const theme = useGame((s) => s.theme)
  const balance = useGame((s) => s.balance)
  const config = useGame((s) => s.config)
  const totalPoints = useGame((s) => s.totalPoints)
  const cashout = useGame((s) => s.cashout)
  const onboardingSeen = useGame((s) => s.onboardingSeen)
  const markOnboardingSeen = useGame((s) => s.markOnboardingSeen)

  const [multiplier, setMultiplier] = useState(1)
  const [showHint, setShowHint] = useState(!onboardingSeen)
  const [levelFlash, setLevelFlash] = useState<{ id: number; points: number } | null>(null)
  const lastLevelRef = useRef(0)

  const growthRate = config?.crash_model.multiplier_growth_rate ?? 0.45
  const pointsPerLine = config?.points.points_per_line ?? 10

  /**
   * Сервер шлёт тик каждые 100 мс, экрану нужно 60 fps — поэтому между
   * тиками достраиваем коэффициент по той же формуле, что и на бэкенде:
   * m(t) = m₀ · e^(rate · Δt). Один rAF-цикл, только чтение из стора.
   */
  useEffect(() => {
    let frame = 0
    const loop = () => {
      const current = useGame.getState().flight
      if (current) {
        const elapsed = (performance.now() - current.serverMultiplierAt) / 1000
        const projected = current.finished
          ? current.serverMultiplier
          : current.serverMultiplier * Math.exp(growthRate * elapsed)
        setMultiplier(projected)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [growthRate])

  useEffect(() => {
    if (!showHint) return
    const seconds = config?.ui.onboarding_hint_duration_sec ?? 4
    const timer = setTimeout(() => {
      setShowHint(false)
      markOnboardingSeen()
    }, seconds * 1000)
    return () => clearTimeout(timer)
  }, [showHint, config, markOnboardingSeen])

  // «+10» при пересечении уровня
  useEffect(() => {
    if (!flight) return
    if (flight.levelsCrossed > lastLevelRef.current) {
      lastLevelRef.current = flight.levelsCrossed
      setLevelFlash({ id: flight.levelsCrossed, points: pointsPerLine })
    }
  }, [flight, pointsPerLine])

  /**
   * Сцена едет от серверного коэффициента (10 раз/сек), а не от
   * интерполированного: иначе четыре слоя гор перерисовывались бы 60 раз
   * в секунду. Короткий CSS-переход сглаживает шаги до непрерывного движения.
   */
  const sceneLift = useMemo(
    () => (flight ? levelProgress(flight.serverMultiplier, flight.thresholds) * LIFT_PER_LEVEL : 0),
    [flight],
  )

  if (!flight) return null

  const canCashout = flight.levelsCrossed >= 1 && flight.cashedOutAt === null && !flight.finished
  const currentWin = Math.floor(flight.bet * multiplier)
  const boostedWin = Math.floor(flight.bet * multiplier * flight.boostMultiplier)
  const cashedOut = flight.cashedOutAt !== null

  // Стиль коэффициента растёт вместе с ним — адаптация правила ТЗ
  // (чёрный → жёлтый → с подсветкой → крупнее) под тёмную сцену.
  const tier = Math.min(3, flight.levelsCrossed)
  const multiplierColor = tier === 0 ? 'var(--cream)' : 'var(--amber)'
  const multiplierSize = tier >= 3 ? 156 : tier >= 2 ? 136 : 120
  const multiplierGlow =
    tier >= 2 ? '0 0 60px rgba(242,166,73,.45), 0 8px 46px rgba(10,8,24,.6)' : '0 8px 46px rgba(10,8,24,.6)'

  return (
    <div className="screen">
      <Scene theme={theme} lift={sceneLift} dimmed={flight.finished} />

      <div className="screen-inner">
        <div className="topbar">
          <span className="chip">
            <span
              style={{
                width: 9,
                height: 9,
                background: theme === 'green' ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)',
              }}
            />
            {theme === 'green' ? 'Изумруд' : 'Бордо'} · {flight.thresholds.length} уровней
          </span>

          <div className="grow wide-only" style={{ display: 'flex', justifyContent: 'center' }}>
            <LeaderStrip points={totalPoints + flight.points} />
          </div>
          <div className="grow" />

          <span className="chip chip-amber">
            <span style={{ color: 'var(--amber)' }}>Баланс</span>
            <span className="num" style={{ fontSize: 20, letterSpacing: 0 }}>
              {fmtInt(balance)}
            </span>
          </span>
        </div>

        <div className="flight-body">
          <Altimeter
            thresholds={flight.thresholds}
            levelsCrossed={flight.levelsCrossed}
            boostLevelIndex={flight.boostLevelIndex}
            boostApplied={flight.boostApplied}
            boostMultiplier={flight.boostMultiplier}
          />

          <div className="flight-stage">
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '10%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                whiteSpace: 'nowrap',
              }}
            >
              <span className="label">Коэффициент</span>
              <div style={{ width: 220, height: 2, background: 'rgba(242,166,73,.7)' }} />
              <span
                className="num"
                style={{
                  fontWeight: 800,
                  fontSize: multiplierSize,
                  lineHeight: 0.9,
                  color: multiplierColor,
                  textShadow: multiplierGlow,
                  transition: 'font-size .4s ease, color .4s ease',
                }}
              >
                {fmtMult(multiplier)}
              </span>
              <div style={{ width: 220, height: 2, background: 'rgba(242,166,73,.7)' }} />
              <span className="chip" style={{ letterSpacing: '.1em' }}>
                Уровень {flight.levelsCrossed} / {flight.thresholds.length}
              </span>
            </div>

            {levelFlash && (
              <span
                key={levelFlash.id}
                className="num"
                style={{
                  position: 'absolute',
                  left: '62%',
                  top: '52%',
                  fontSize: 26,
                  color: 'var(--amber)',
                  animation: 'floatUp 2.4s ease-out forwards',
                }}
              >
                +{levelFlash.points}
              </span>
            )}

            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '6%',
                transform: 'translateX(-50%)',
              }}
            >
              <Balloon theme={theme} width={186} popped={flight.finished} />
            </div>

            {showHint && (
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 0,
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  animation: 'fadeIn .4s ease',
                }}
              >
                <span
                  style={{
                    padding: '12px 18px',
                    background: 'var(--ink)',
                    borderRadius: 3,
                    fontSize: 13,
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  Нажми «Забрать» до того, как шар лопнет
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--amber)">
                  <path d="M12 20l-7-8h4.6V4h4.8v8H19z" />
                </svg>
              </div>
            )}

            {cashedOut && (
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: '2%',
                  transform: 'translateX(-50%)',
                  padding: '14px 22px',
                  background: 'var(--amber-dim)',
                  border: '1px solid var(--amber)',
                  borderRadius: 3,
                  textAlign: 'center',
                  animation: 'fadeIn .3s ease',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--amber)' }}>
                  Забрали {fmtInt(flight.winAmount)} на {fmtMult(flight.cashedOutAt!)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, opacity: 0.75 }}>
                  Могли бы забрать больше — шар ещё летит
                </div>
              </div>
            )}
          </div>

          <RoundJournal
            bet={flight.bet}
            points={flight.points}
            boostMultiplier={flight.boostMultiplier}
            boostFired={flight.boostApplied}
            boostLevel={flight.boostLevelIndex}
            resultHash={flight.resultHash}
          />
        </div>

        <div className="flight-bottom">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="label">{cashedOut ? 'Забрали' : 'Заберёте сейчас'}</span>
            <span className="num" style={{ fontWeight: 800, fontSize: 42, lineHeight: 1 }}>
              {fmtInt(cashedOut ? flight.winAmount : currentWin)}
            </span>
          </div>

          {flight.boostMultiplier > 1 && !cashedOut && (
            <>
              <div className="narrow-hide" style={{ width: 1, height: 48, background: 'var(--line)' }} />
              <div className="narrow-hide" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="label">С бустером ×{flight.boostMultiplier}</span>
                <span
                  className="num"
                  style={{ fontWeight: 800, fontSize: 42, lineHeight: 1, color: 'var(--amber)' }}
                >
                  {fmtInt(boostedWin)}
                </span>
              </div>
            </>
          )}

          <div className="narrow-hide" style={{ width: 1, height: 48, background: 'var(--line)' }} />
          <div className="narrow-hide" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="label">Очки</span>
            <span
              className="num"
              style={{ fontWeight: 800, fontSize: 42, lineHeight: 1, color: 'var(--emerald-lt)' }}
            >
              {flight.points}
            </span>
          </div>

          <div className="grow" />

          <button className="btn btn-primary" disabled={!canCashout} onClick={() => void cashout()}>
            {cashedOut ? 'Выигрыш зафиксирован' : 'Забрать'}
            {canCashout && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#241e36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </div>

        {!canCashout && !cashedOut && !flight.finished && (
          <span
            style={{
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--amber)',
              marginTop: -8,
            }}
          >
            «Забрать» откроется после первого уровня
          </span>
        )}
      </div>
    </div>
  )
}

function RoundJournal({
  bet,
  points,
  boostMultiplier,
  boostFired,
  boostLevel,
  resultHash,
}: {
  bet: number
  points: number
  boostMultiplier: number
  boostFired: boolean
  boostLevel: number | null
  resultHash: string
}) {
  return (
    <div className="panel wide-only" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span className="label">Текущий раунд</span>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Stat value={fmtInt(bet)} caption="ставка" />
        <Stat value={String(points)} caption="очки за раунд" accent />
      </div>

      <div className="hr" />

      {boostMultiplier > 1 ? (
        <div
          style={{
            display: 'flex',
            gap: 13,
            alignItems: 'flex-start',
            padding: 13,
            background: 'var(--amber-dim)',
            border: '1px solid rgba(242,166,73,.42)',
            borderRadius: 3,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 12 12" fill="var(--amber)" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M6 0 L12 6 L6 12 L0 6 Z" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)' }}>
              {boostFired ? `Бустер ×${boostMultiplier} сработал` : `Бустер ×${boostMultiplier} впереди`}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.45, opacity: 0.68 }}>
              {boostFired
                ? 'Коэффициент уже умножен'
                : boostLevel !== null
                  ? `Ждёт на уровне ${boostLevel + 1} — сработает, если долетите туда раньше, чем заберёте`
                  : 'Сработает, если долетите до его уровня раньше, чем заберёте'}
            </span>
          </div>
        </div>
      ) : (
        <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.6, lineHeight: 1.5 }}>
          Ставка без бустера — коэффициент растёт только со временем полёта.
        </span>
      )}

      <div className="grow" />
      <div className="hr" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-lt)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7.5 3.4v5.1c0 4.6-3.2 8.8-7.5 10-4.3-1.2-7.5-5.4-7.5-10V6.4L12 3z" />
            <path d="M9 12l2.2 2.2L15.5 10" />
          </svg>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--emerald-lt)',
            }}
          >
            Исход определён до взлёта
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
            color: 'rgba(242,234,219,.38)',
            wordBreak: 'break-all',
          }}
        >
          {resultHash.slice(0, 16)}…
        </span>
      </div>
    </div>
  )
}

function Stat({ value, caption, accent }: { value: string; caption: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span
        className="num"
        style={{ fontSize: 24, color: accent ? 'var(--amber)' : 'var(--cream)' }}
      >
        {value}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.5 }}>{caption}</span>
    </div>
  )
}
