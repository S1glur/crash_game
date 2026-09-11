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

  /**
   * Птицы и облака: количество и позиции разыгрываются заново при каждом заходе
   * на экран, по 1–3 штуки каждого — как требует §1.1 ТЗ. Птицы летят заметно
   * быстрее облаков, за счёт этого читается глубина сцены.
   */
  const birds = useMemo(
    () =>
      Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({
        top: 60 + Math.random() * 170,
        scale: 0.65 + Math.random() * 0.55,
        duration: 26 + Math.random() * 16,
        delay: -Math.random() * 30,
      })),
    [],
  )

  const clouds = useMemo(
    () =>
      Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({
        top: 48 + Math.random() * 150,
        scale: 0.8 + Math.random() * 0.9,
        duration: 150 + Math.random() * 120,
        delay: -Math.random() * 160,
      })),
    [],
  )

  /** Дальние шары — тоже каждый раз в новом составе, 2–4 штуки. */
  const farBalloons = useMemo(
    () =>
      Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({
        top: 170 + Math.random() * 200,
        size: 16 + Math.random() * 20,
        duration: 150 + Math.random() * 130,
        delay: -Math.random() * 200,
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

      <Moon />

      {clouds.map((cloud, i) => (
        <Cloud key={i} {...cloud} />
      ))}

      {/* слои гор: чем ближе, тем сильнее сдвигаются при подъёме */}
      <Layer lift={lift * 0.25} color="#6b5070" opacity={0.4} path="M0 214 L156 138 L258 196 L378 108 L508 214 L634 154 L760 228 L890 140 L1016 220 L1150 132 L1274 206 L1392 156 L1440 200 L1440 400 L0 400 Z" />

      {/* Дальний город: тонкие минареты на гребне самого дальнего хребта. */}
      <Ridge lift={lift * 0.25} color="#6b5070" opacity={0.45}>
        <Minaret x={150} baseY={140} height={62} />
        <Minaret x={402} baseY={112} height={50} />
        <Minaret x={1150} baseY={136} height={58} />
        <Minaret x={1274} baseY={208} height={40} />
      </Ridge>

      <Layer lift={lift * 0.5} color="#3e3862" opacity={0.85} path="M0 272 L134 202 L280 268 L420 186 L562 276 L708 210 L850 284 L996 204 L1140 274 L1278 216 L1440 268 L1440 400 L0 400 Z" />

      {/* Дворец в центре — тот самый силуэт с горящими окнами. */}
      <Ridge lift={lift * 0.5} color="#2f2a4f" opacity={1}>
        <Palace x={648} baseY={276} />
      </Ridge>

      {farBalloons.map((balloon, i) => (
        <FarBalloon key={i} {...balloon} />
      ))}

      {birds.map((bird, i) => (
        <Birds key={i} {...bird} />
      ))}

      <Layer lift={lift * 0.78} color="#282343" opacity={1} path="M0 330 L176 274 L334 328 L492 266 L650 336 L810 278 L968 340 L1128 282 L1288 336 L1440 298 L1440 400 L0 400 Z" />

      {/* Одинокие деревья на ближнем хребте — как в референсе. */}
      <Ridge lift={lift * 0.78} color="#1d1936" opacity={1}>
        <Tree x={232} baseY={300} scale={1} />
        <Tree x={1186} baseY={306} scale={0.82} />
        <Tree x={1268} baseY={320} scale={1.1} />
      </Ridge>

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

/** Растущий месяц в правом верхнем углу — как в референсе. */
function Moon() {
  return (
    <svg
      width="46"
      height="46"
      viewBox="0 0 46 46"
      style={{
        position: 'absolute',
        top: 58,
        right: '13%',
        filter: 'drop-shadow(0 0 22px rgba(246,241,226,.35))',
      }}
    >
      {/* Месяц вырезаем из круга вторым кругом — так серп получается ровным. */}
      <defs>
        <mask id="crescent">
          <rect width="46" height="46" fill="#000" />
          <circle cx="23" cy="23" r="15" fill="#fff" />
          <circle cx="30" cy="18" r="14" fill="#000" />
        </mask>
      </defs>
      <circle cx="23" cy="23" r="15" fill="#f6e3d2" mask="url(#crescent)" />
    </svg>
  )
}

/**
 * Обёртка для объектов, стоящих на конкретном хребте: повторяет его сдвиг при
 * подъёме шара, поэтому дворцы и деревья не «отклеиваются» от своего слоя.
 */
function Ridge({
  lift,
  color,
  opacity,
  children,
}: {
  lift: number
  color: string
  opacity: number
  children: React.ReactNode
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
      fill={color}
      opacity={opacity}
    >
      {children}
    </svg>
  )
}

/** Дворец: ступенчатое основание, колоннада с арками, башня со шпилем и флагом. */
function Palace({ x, baseY }: { x: number; baseY: number }) {
  const columns = Array.from({ length: 9 }, (_, i) => -108 + i * 27)
  const windows = Array.from({ length: 5 }, (_, i) => -44 + i * 22)

  return (
    <g transform={`translate(${x} ${baseY})`}>
      {/* нижняя терраса */}
      <rect x="-132" y="-18" width="264" height="20" />
      {columns.map((cx, i) => (
        <rect key={i} x={cx} y="-44" width="11" height="26" />
      ))}
      <rect x="-120" y="-52" width="240" height="10" />

      {/* верхний ярус */}
      <rect x="-86" y="-78" width="172" height="26" />
      <rect x="-72" y="-92" width="144" height="16" />

      {/* центральная башня */}
      <path d="M-34 -92 L-34 -136 L-22 -148 L-10 -136 L-10 -92 Z" />
      <rect x="-30" y="-150" width="60" height="58" />
      <path d="M0 -196 L22 -166 L22 -150 L-22 -150 L-22 -166 Z" />
      <rect x="-3" y="-224" width="6" height="30" />
      <path d="M3 -222 L34 -214 L3 -206 Z" />

      {/* зубцы по краям верхнего яруса */}
      {[-84, -66, -48, 48, 66, 84].map((bx, i) => (
        <rect key={i} x={bx} y="-100" width="10" height="12" />
      ))}

      {/* горящие окна — тёплые точки, главная деталь силуэта */}
      {windows.map((wx, i) => (
        <circle key={i} cx={wx} cy="-62" r="3.4" fill="#f2a649" opacity="0.95" />
      ))}
    </g>
  )
}

/** Тонкая башня-минарет для дальнего плана. */
function Minaret({ x, baseY, height }: { x: number; baseY: number; height: number }) {
  return (
    <g transform={`translate(${x} ${baseY})`}>
      <rect x="-5" y={-height} width="10" height={height} />
      <path d={`M0 ${-height - 20} L7 ${-height} L-7 ${-height} Z`} />
      <rect x="-9" y={-height + 14} width="18" height="4" />
    </g>
  )
}

/** Плоское дерево-зонтик из палитры Alto. */
function Tree({ x, baseY, scale }: { x: number; baseY: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${baseY}) scale(${scale})`}>
      <rect x="-2" y="-26" width="4" height="26" />
      <path d="M0 -50 L26 -30 L14 -24 L20 -18 L-20 -18 L-14 -24 L-26 -30 Z" />
    </g>
  )
}

/**
 * Стайка птиц. Летит заметно быстрее облаков — за счёт разницы скоростей
 * читается глубина (§1.1 ТЗ).
 */
function Birds({
  top,
  scale,
  duration,
  delay,
}: {
  top: number
  scale: number
  duration: number
  delay: number
}) {
  return (
    <svg
      width="74"
      height="26"
      viewBox="0 0 74 26"
      fill="none"
      stroke="#241e36"
      strokeWidth="1.6"
      strokeLinecap="round"
      style={{
        position: 'absolute',
        top,
        left: 0,
        opacity: 0.55,
        transform: `scale(${scale})`,
        animation: `driftFar ${duration}s linear ${delay}s infinite`,
      }}
    >
      <path d="M4 12 q5 -5 10 0 q5 -5 10 0" />
      <path d="M30 5 q4 -4 8 0 q4 -4 8 0" />
      <path d="M50 16 q4.5 -4.5 9 0 q4.5 -4.5 9 0" />
    </svg>
  )
}

/** Мягкое облако: несколько наложенных эллипсов, почти прозрачное. */
function Cloud({
  top,
  scale,
  duration,
  delay,
}: {
  top: number
  scale: number
  duration: number
  delay: number
}) {
  return (
    <svg
      width="190"
      height="52"
      viewBox="0 0 190 52"
      style={{
        position: 'absolute',
        top,
        left: 0,
        opacity: 0.16,
        transform: `scale(${scale})`,
        animation: `driftFar ${duration}s linear ${delay}s infinite`,
      }}
      fill="#f6f1e2"
    >
      <ellipse cx="58" cy="34" rx="54" ry="13" />
      <ellipse cx="92" cy="24" rx="38" ry="17" />
      <ellipse cx="132" cy="33" rx="46" ry="12" />
    </svg>
  )
}
