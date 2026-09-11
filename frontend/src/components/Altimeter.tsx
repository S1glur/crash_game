import { memo } from 'react'

/**
 * Шкала высоты: уровни из levelThresholds, пройденные подсвечены янтарём.
 *
 * Маркер бустера виден с самого взлёта — /round/start отдаёт boostLevelIndex.
 * До срабатывания он приглушён и полупрозрачен («шар ещё не долетел»), после —
 * заливается янтарём и пульсирует. Это и есть механика из ТЗ: игрок видит,
 * до какого уровня надо дотерпеть, и сам решает, рискнуть ли ради бустера.
 */
function AltimeterView({
  thresholds,
  levelsCrossed,
  boostLevelIndex,
  boostApplied,
  boostMultiplier,
}: {
  thresholds: number[]
  levelsCrossed: number
  boostLevelIndex: number | null
  boostApplied: boolean
  boostMultiplier: number
}) {
  const progress = thresholds.length ? levelsCrossed / thresholds.length : 0

  return (
    <div
      className="panel"
      style={{
        position: 'relative',
        width: 172,
        padding: '16px 14px',
        background: 'rgba(16,13,32,.5)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 62,
          top: 20,
          bottom: 20,
          width: 2,
          background: 'rgba(242,234,219,.16)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 62,
          bottom: 20,
          width: 2,
          height: `calc(${progress * 100}% - 40px * ${progress})`,
          background: 'var(--amber)',
          transition: 'height .35s ease',
        }}
      />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column-reverse',
          justifyContent: 'space-between',
          height: '100%',
        }}
      >
        {thresholds.map((threshold, index) => {
          const passed = index < levelsCrossed
          const current = index === levelsCrossed - 1
          const isBoost = boostLevelIndex === index

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                height: 20,
                animation: isBoost && boostApplied ? 'markPulse 2.4s ease-in-out infinite' : undefined,
              }}
            >
              <span
                className="num"
                style={{
                  width: 30,
                  textAlign: 'right',
                  fontSize: current ? 24 : 15,
                  fontWeight: current || passed ? 800 : 600,
                  color: current
                    ? 'var(--cream)'
                    : passed || isBoost
                      ? 'var(--amber)'
                      : 'rgba(242,234,219,.5)',
                  transition: 'color .3s ease, font-size .3s ease',
                }}
              >
                {index + 1}
              </span>

              <div
                style={{
                  width: current ? 42 : passed ? 30 : 18,
                  height: current ? 3 : 2,
                  background: current
                    ? 'var(--cream)'
                    : passed || isBoost
                      ? 'var(--amber)'
                      : 'rgba(242,234,219,.28)',
                  transition: 'width .3s ease, background .3s ease',
                }}
              />

              {isBoost ? (
                <span
                  title={boostApplied ? 'Бустер сработал' : 'Бустер ждёт на этом уровне'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 8px',
                    background: boostApplied ? 'var(--amber)' : 'transparent',
                    border: boostApplied ? '1px solid var(--amber)' : '1px dashed var(--amber)',
                    opacity: boostApplied ? 1 : 0.72,
                    borderRadius: 2,
                    transition: 'background .3s ease, opacity .3s ease',
                  }}
                >
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 12 12"
                    fill={boostApplied ? '#241e36' : 'var(--amber)'}
                  >
                    <path d="M6 0 L12 6 L6 12 L0 6 Z" />
                  </svg>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: boostApplied ? '#241e36' : 'var(--amber)',
                    }}
                  >
                    ×{boostMultiplier}
                  </span>
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: passed ? 'rgba(242,234,219,.42)' : 'rgba(242,234,219,.34)',
                  }}
                >
                  {threshold.toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Перерисовывается только при смене уровня, а не на каждом кадре. */
export const Altimeter = memo(AltimeterView)
