import { useMemo } from 'react'
import type { Theme } from '../api/types'

/**
 * Фоновая сцена: сумеречное небо, звёзды, луна, четыре силуэтных слоя гор
 * и гирлянда флажков. Слои сдвигаются вниз по мере подъёма шара — так «камера»
 * следует за ним, не двигая сам шар (дёшево по кадрам, см. требование 60 fps).
 */
export function Scene({
  theme,
  lift = 0,
  dimmed = false,
}: {
  theme: Theme
  lift?: number
  dimmed?: boolean
}) {
  // Позиции звёзд генерируются один раз на монтирование — при каждом заходе новые.
  const stars = useMemo(
    () =>
      Array.from({ length: 34 }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 46,
        size: Math.random() > 0.65 ? 3 : 2,
        twinkle: Math.random() > 0.7,
        delay: Math.random() * 5,
      })),
    [],
  )

  const isGreen = theme === 'green'

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        filter: dimmed ? 'saturate(0.65) brightness(0.72)' : undefined,
        transition: 'filter 0.6s ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isGreen
            ? 'linear-gradient(180deg, #121a38 0%, #22335a 22%, #35566b 44%, #5e8479 64%, #97a878 84%, #d8b070 100%)'
            : 'linear-gradient(180deg, #101530 0%, #1e2242 22%, #38315c 42%, #6b466a 60%, #a85c64 76%, #d9855a 90%, #f0a867 100%)',
        }}
      />

      {stars.map((star, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            background: '#fff',
            opacity: star.twinkle ? 0.5 : 0.85,
            animation: star.twinkle ? `twinkle 4.6s ease-in-out ${star.delay}s infinite` : undefined,
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          top: 74,
          left: '27%',
          width: 78,
          height: 78,
          borderRadius: '50%',
          background: '#f6f1e2',
          boxShadow: '0 0 64px 22px rgba(246,241,226,.2)',
        }}
      />

      {/* дальние шары — ощущение обитаемого неба */}
      <FarBalloon top={236} size={30} duration={170} />
      <FarBalloon top={318} size={22} duration={240} delay={-110} />

      {/* слои гор: чем ближе, тем сильнее сдвигаются при подъёме */}
      <Layer lift={lift * 0.25} color="#6b5070" opacity={0.4} path="M0 214 L156 138 L258 196 L378 108 L508 214 L634 154 L760 228 L890 140 L1016 220 L1150 132 L1274 206 L1392 156 L1440 200 L1440 400 L0 400 Z" />
      <Layer lift={lift * 0.5} color="#3e3862" opacity={0.85} path="M0 272 L134 202 L280 268 L420 186 L562 276 L708 210 L850 284 L996 204 L1140 274 L1278 216 L1440 268 L1440 400 L0 400 Z" />
      <Layer lift={lift * 0.78} color="#282343" opacity={1} path="M0 330 L176 274 L334 328 L492 266 L650 336 L810 278 L968 340 L1128 282 L1288 336 L1440 298 L1440 400 L0 400 Z" />
      <Layer lift={lift} color="#16132c" opacity={1} path="M0 378 C196 352 356 384 552 368 C748 352 888 386 1084 372 C1248 360 1356 380 1440 370 L1440 400 L0 400 Z" />

      <svg
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          bottom: 128,
          left: 0,
          width: '100%',
          height: 90,
          transform: `translateY(${lift}px)`,
          transition: 'transform .16s linear',
          opacity: 0.9,
        }}
        fill="none"
      >
        <path
          d="M-10 16 C240 70 560 80 860 52 C1100 30 1310 36 1450 22"
          stroke="#16132c"
          strokeWidth="2"
        />
        <g fill="#282343">
          {BUNTING.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
    </div>
  )
}

function Layer({
  path,
  color,
  opacity,
  lift,
}: {
  path: string
  color: string
  opacity: number
  lift: number
}) {
  return (
    <svg
      viewBox="0 0 1440 400"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: 400,
        display: 'block',
        transform: `translateY(${lift}px)`,
        transition: 'transform .16s linear',
        willChange: 'transform',
      }}
    >
      <path d={path} fill={color} opacity={opacity} />
    </svg>
  )
}

function FarBalloon({
  top,
  size,
  duration,
  delay = 0,
}: {
  top: number
  size: number
  duration: number
  delay?: number
}) {
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 34 48"
      fill="#272b4e"
      style={{
        position: 'absolute',
        top,
        left: 0,
        opacity: 0.85,
        animation: `driftFar ${duration}s linear ${delay}s infinite`,
      }}
    >
      <path d="M17 2c8 0 15 6 15 14 0 8-7 15-11 20h-8C9 31 2 24 2 16 2 8 9 2 17 2z" />
      <rect x="13" y="38" width="8" height="6" rx="1" />
    </svg>
  )
}

const BUNTING = [
  'M120 36 l16 3 -6 18 -14 -3 z',
  'M220 48 l16 3 -6 18 -14 -3 z',
  'M320 57 l16 2 -5 18 -15 -2 z',
  'M420 63 l16 2 -5 18 -15 -2 z',
  'M520 67 l16 1 -4 18 -15 -1 z',
  'M620 68 l16 0 -3 18 -16 0 z',
  'M720 66 l16 -1 -3 18 -16 1 z',
  'M820 61 l16 -2 -2 18 -16 2 z',
  'M920 54 l16 -3 -1 18 -16 3 z',
  'M1020 46 l16 -3 0 18 -16 3 z',
  'M1120 38 l16 -3 1 18 -16 3 z',
  'M1220 31 l16 -2 2 18 -16 2 z',
  'M1320 25 l16 -2 3 18 -16 2 z',
]
