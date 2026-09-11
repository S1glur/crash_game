import { useId, useMemo } from 'react'
import type { Theme } from '../api/types'

/**
 * Фоновая сцена: сумеречное небо, светило за дворцом и четыре силуэтных плана
 * с постройками.
 *
 * Два решения, на которых всё держится:
 *
 * 1. Хребет и всё, что на нём стоит, живут в ОДНОЙ системе координат. Линия
 *    хребта задана массивом точек, а высота под постройкой берётся из этой же
 *    ломаной функцией yAt(). Поэтому здание физически не может ни парить, ни
 *    провалиться: его основание — это и есть поверхность горы в данной точке.
 *    Раньше координаты зданий подбирались вручную, и любое расхождение с
 *    линией читалось как «дворец висит в воздухе».
 *
 * 2. preserveAspectRatio="xMidYMax slice" — масштаб одинаков по обеим осям.
 *    Прежний "none" тянул viewBox по ширине экрана: ломаной горы это незаметно,
 *    а дворец расплющивало тем сильнее, чем шире монитор.
 *
 * Ощущение высоты даёт не подъём шара по экрану, а то, что планы одновременно
 * уходят вниз и уменьшаются — чем ближе план, тем сильнее. Так работает
 * настоящий отлёт камеры от земли.
 */

type Point = [x: number, y: number]

/** Высота системы координат сцены. Низ viewBox — низ экрана. */
const SCENE_H = 400

/** Насколько плана уезжает вниз на полной высоте полёта, пиксели viewBox. */
const DRIFT = 150

/** Гряды: чем дальше, тем выше и мельче зубцы. */
const RIDGE_FAR: Point[] = [
  [0, 220], [58, 168], [108, 198], [166, 118], [210, 152], [256, 196],
  [314, 130], [358, 170], [418, 102], [468, 148], [518, 190], [576, 138],
  [632, 174], [688, 124], [744, 180], [798, 146], [858, 192], [904, 132],
  [962, 178], [1018, 208], [1076, 148], [1130, 118], [1184, 166], [1238, 198],
  [1296, 140], [1350, 178], [1398, 150], [1440, 194],
]

const RIDGE_MID: Point[] = [
  [0, 282], [74, 236], [138, 268], [206, 204], [268, 246], [328, 282],
  [396, 212], [450, 254], [510, 288], [564, 238], [626, 264], [688, 214],
  [750, 252], [810, 290], [866, 234], [926, 264], [988, 210], [1048, 252],
  [1110, 284], [1168, 236], [1230, 268], [1288, 220], [1350, 260], [1406, 232],
  [1440, 270],
]

const RIDGE_NEAR: Point[] = [
  [0, 338], [86, 298], [162, 334], [234, 284], [304, 322], [378, 346],
  [450, 294], [518, 332], [590, 352], [658, 306], [728, 338], [798, 298],
  [866, 340], [934, 358], [1002, 310], [1072, 342], [1138, 302], [1204, 340],
  [1272, 358], [1342, 316], [1398, 342], [1440, 324],
]

const RIDGE_FRONT: Point[] = [
  [0, 384], [118, 364], [238, 386], [358, 360], [478, 382], [598, 356],
  [718, 380], [838, 358], [958, 384], [1078, 362], [1198, 382], [1318, 360],
  [1440, 378],
]

/** Ломаная + заливка до низа кадра. */
function ridgePath(points: Point[]): string {
  const line = points.map(([x, y]) => `${x} ${y}`).join(' L')
  return `M${line} L1440 ${SCENE_H} L0 ${SCENE_H} Z`
}

/** Высота поверхности хребта в точке x — линейная интерполяция по ломаной. */
function yAt(points: Point[], x: number): number {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    if (x >= x0 && x <= x1) {
      const span = x1 - x0
      return span === 0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / span
    }
  }
  return points[points.length - 1][1]
}

/** Дворец стоит на вершине среднего хребта — вокруг него строится композиция. */
const PALACE_X = 688

export function Scene({
  theme,
  altitude = 0,
  dimmed = false,
}: {
  theme: Theme
  /** Высота полёта от 0 до 1. Управляет и сдвигом планов, и их уменьшением. */
  altitude?: number
  dimmed?: boolean
}) {
  const uid = useId().replace(/:/g, '')
  const height = Math.max(0, Math.min(1, altitude))

  const stars = useMemo(
    () =>
      Array.from({ length: 38 }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 42,
        size: Math.random() > 0.65 ? 3 : 2,
        twinkle: Math.random() > 0.7,
        delay: Math.random() * 5,
      })),
    [],
  )

  /**
   * Птицы и облака: по 1–3 штуки, состав и позиции разыгрываются заново при
   * каждом заходе (§1.1 ТЗ). Птицы пересекают экран за 26–42 с, облака за
   * 150–270 — разница скоростей и читается как глубина.
   */
  const birds = useMemo(
    () =>
      Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({
        top: 150 + Math.random() * 150,
        scale: 0.6 + Math.random() * 0.5,
        duration: 26 + Math.random() * 16,
        delay: -Math.random() * 30,
      })),
    [],
  )

  const clouds = useMemo(
    () =>
      Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({
        top: 70 + Math.random() * 140,
        scale: 0.85 + Math.random() * 0.9,
        duration: 150 + Math.random() * 120,
        delay: -Math.random() * 160,
      })),
    [],
  )

  const farBalloons = useMemo(
    () =>
      Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({
        top: 150 + Math.random() * 190,
        size: 16 + Math.random() * 20,
        duration: 150 + Math.random() * 130,
        delay: -Math.random() * 200,
      })),
    [],
  )

  const isGreen = theme === 'green'

  // Палитра планов: от дымчатого дальнего к почти чёрному ближнему.
  const ridge = isGreen
    ? ['#5c7b86', '#3c5a6b', '#263c4f', '#142130']
    : ['#7b5f7e', '#4d4068', '#2e2648', '#18132c']

  const sunY = yAt(RIDGE_MID, PALACE_X) - 58

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
            ? 'linear-gradient(180deg, #0d1730 0%, #1b3055 24%, #325a6d 46%, #6f8e83 68%, #c2a97f 88%, #e8c58d 100%)'
            : 'linear-gradient(180deg, #0d1130 0%, #1d2044 22%, #3a2f5e 42%, #77486c 62%, #bd6a68 78%, #e89a6a 92%, #f5bd86 100%)',
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
            borderRadius: '50%',
            background: '#fff',
            opacity: star.twinkle ? 0.5 : 0.85,
            animation: star.twinkle ? `twinkle 4.6s ease-in-out ${star.delay}s infinite` : undefined,
          }}
        />
      ))}

      <Moon uid={uid} />

      {clouds.map((cloud, i) => (
        <Cloud key={i} {...cloud} />
      ))}

      {/* --- дальний план: мелкие храмы и башни для масштаба --- */}
      <Plane height={height} depth={0.24} shrink={0.05}>
        <g fill={ridge[0]} opacity={0.62}>
          <path d={ridgePath(RIDGE_FAR)} />
          <OnRidge points={RIDGE_FAR} x={166}><Minaret height={44} /></OnRidge>
          <OnRidge points={RIDGE_FAR} x={418}><Temple scale={0.5} /></OnRidge>
          <OnRidge points={RIDGE_FAR} x={468}><Minaret height={34} /></OnRidge>
          <OnRidge points={RIDGE_FAR} x={904}><Minaret height={40} /></OnRidge>
          <OnRidge points={RIDGE_FAR} x={1130}><Ziggurat scale={0.46} /></OnRidge>
          <OnRidge points={RIDGE_FAR} x={1296}><Minaret height={36} /></OnRidge>
        </g>
      </Plane>

      {/*
        Светило садится ровно за дворцом: силуэт на светлом диске — главный приём
        композиции. Лежит в той же системе координат и едет с тем же планом,
        поэтому при подъёме не разъезжается с постройкой.
      */}
      <Plane height={height} depth={0.62} shrink={0.15}>
        <defs>
          <radialGradient id={`sun-${uid}`}>
            <stop offset="0%" stopColor={isGreen ? '#fdf3d8' : '#fff1e2'} />
            <stop offset="52%" stopColor={isGreen ? '#f7e3b0' : '#ffcfa8'} />
            <stop offset="100%" stopColor={isGreen ? 'rgba(247,227,176,0)' : 'rgba(255,207,168,0)'} />
          </radialGradient>
        </defs>
        <circle cx={PALACE_X} cy={sunY} r={112} fill={`url(#sun-${uid})`} />
      </Plane>

      {/* Дымка у горизонта — она отделяет дальние планы от ближних. */}
      <Plane height={height} depth={0.4} shrink={0.08}>
        <defs>
          <linearGradient id={`haze-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isGreen ? 'rgba(226,205,155,0)' : 'rgba(255,186,146,0)'} />
            <stop offset="100%" stopColor={isGreen ? 'rgba(226,205,155,.4)' : 'rgba(255,165,138,.4)'} />
          </linearGradient>
        </defs>
        <rect x="0" y="176" width="1440" height="150" fill={`url(#haze-${uid})`} />
      </Plane>

      {/* --- средний план: дворец, храмы, колоннада --- */}
      <Plane height={height} depth={0.62} shrink={0.15}>
        <g fill={ridge[1]}>
          <path d={ridgePath(RIDGE_MID)} />
          <OnRidge points={RIDGE_MID} x={206}><Temple scale={0.72} /></OnRidge>
          <OnRidge points={RIDGE_MID} x={396}><Minaret height={54} /></OnRidge>
          <OnRidge points={RIDGE_MID} x={PALACE_X}><Palace /></OnRidge>
          <OnRidge points={RIDGE_MID} x={988}><Ziggurat scale={0.8} /></OnRidge>
          <OnRidge points={RIDGE_MID} x={1288}><Temple scale={0.66} /></OnRidge>
        </g>
      </Plane>

      {farBalloons.map((balloon, i) => (
        <FarBalloon key={i} {...balloon} color={ridge[1]} />
      ))}

      {birds.map((bird, i) => (
        <Birds key={i} {...bird} color={ridge[2]} />
      ))}

      {/* --- ближний план: руины колоннады и деревья --- */}
      <Plane height={height} depth={0.82} shrink={0.24}>
        <g fill={ridge[2]}>
          <path d={ridgePath(RIDGE_NEAR)} />
          <OnRidge points={RIDGE_NEAR} x={234}><Tree scale={1} /></OnRidge>
          <OnRidge points={RIDGE_NEAR} x={450}><Colonnade scale={0.9} /></OnRidge>
          <OnRidge points={RIDGE_NEAR} x={798}><Tree scale={0.82} /></OnRidge>
          <OnRidge points={RIDGE_NEAR} x={1002}><Temple scale={0.54} /></OnRidge>
          <OnRidge points={RIDGE_NEAR} x={1138}><Tree scale={1.1} /></OnRidge>
        </g>
      </Plane>

      {/* --- передний план --- */}
      <Plane height={height} depth={1} shrink={0.32}>
        <g fill={ridge[3]}>
          <path d={ridgePath(RIDGE_FRONT)} />
          <OnRidge points={RIDGE_FRONT} x={358}><Tree scale={1.25} /></OnRidge>
          <OnRidge points={RIDGE_FRONT} x={1078}><Tree scale={1.35} /></OnRidge>
        </g>
      </Plane>
    </div>
  )
}

/**
 * План сцены. При наборе высоты одновременно уезжает вниз и уменьшается,
 * причём ближние планы — сильнее дальних: именно разница скоростей и
 * масштабов даёт ощущение, что земля отдаляется.
 */
function Plane({
  height,
  depth,
  shrink,
  children,
}: {
  height: number
  depth: number
  shrink: number
  children: React.ReactNode
}) {
  const scale = 1 - height * shrink
  const shift = height * DRIFT * depth

  return (
    <svg
      viewBox={`0 0 1440 ${SCENE_H}`}
      preserveAspectRatio="xMidYMax slice"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        /*
          Высота держит пропорцию кадра (1440×400), пока экран шире 1440 —
          тогда масштаб одинаков по осям и вершины гор не срезаются. На узких
          экранах высота фиксируется на 400, и slice просто кадрирует пейзаж по
          горизонтали: вид становится ближе, что для телефона даже лучше.
        */
        height: 'max(400px, 27.78vw)',
        display: 'block',
        // Уменьшаем от нижней кромки: земля остаётся на месте, а всё,
        // что выше неё, сжимается к горизонту.
        transformOrigin: '50% 100%',
        transform: `translateY(${shift}px) scale(${scale})`,
        transition: 'transform .16s linear',
        willChange: 'transform',
      }}
    >
      {children}
    </svg>
  )
}

/**
 * Ставит постройку на поверхность хребта: координата Y берётся из той же
 * ломаной, что рисует гору, поэтому основание всегда совпадает со склоном.
 * Постройки рисуются вверх от нуля — низ фигуры и есть точка опоры.
 */
function OnRidge({
  points,
  x,
  children,
}: {
  points: Point[]
  x: number
  children: React.ReactNode
}) {
  return <g transform={`translate(${x} ${yAt(points, x)})`}>{children}</g>
}

/** Дворец: терраса, колоннада, верхний ярус с зубцами, башня со шпилем. */
function Palace() {
  const columns = Array.from({ length: 9 }, (_, i) => -108 + i * 27)
  const windows = Array.from({ length: 5 }, (_, i) => -44 + i * 22)

  return (
    <g>
      <rect x="-125" y="-20" width="250" height="22" />
      {columns.map((cx, i) => (
        <rect key={i} x={cx} y="-46" width="11" height="26" />
      ))}
      <rect x="-116" y="-56" width="232" height="10" />

      <rect x="-84" y="-82" width="168" height="26" />
      <rect x="-70" y="-96" width="140" height="14" />
      {[-68, -50, -32, 32, 50, 68].map((bx, i) => (
        <rect key={i} x={bx} y="-106" width="10" height="12" />
      ))}

      <rect x="-30" y="-154" width="60" height="58" />
      <path d="M0 -202 L22 -172 L22 -154 L-22 -154 L-22 -172 Z" />
      <rect x="-3" y="-230" width="6" height="28" />
      <path d="M3 -228 L34 -220 L3 -212 Z" />

      {windows.map((wx, i) => (
        <circle key={i} cx={wx} cy="-66" r="3.4" fill="#f2a649" opacity="0.95" />
      ))}
    </g>
  )
}

/** Храм с куполом — добавляет масштаб рядом с дворцом. */
function Temple({ scale }: { scale: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <rect x="-62" y="-16" width="124" height="18" />
      <rect x="-48" y="-60" width="96" height="44" />
      {[-36, -12, 12].map((cx, i) => (
        <rect key={i} x={cx} y="-52" width="24" height="36" fill="#000" opacity="0.16" />
      ))}
      <path d="M-36 -60 A36 36 0 0 1 36 -60 Z" />
      <rect x="-3" y="-112" width="6" height="16" />
      <circle cx="0" cy="-114" r="5" />
      <rect x="-62" y="-46" width="14" height="30" />
      <rect x="48" y="-46" width="14" height="30" />
      <circle cx="-22" cy="-30" r="2.6" fill="#f2a649" opacity="0.9" />
      <circle cx="22" cy="-30" r="2.6" fill="#f2a649" opacity="0.9" />
    </g>
  )
}

/** Ступенчатый храм — силуэт, отличный от дворца и купольного храма. */
function Ziggurat({ scale }: { scale: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <rect x="-70" y="-22" width="140" height="24" />
      <rect x="-54" y="-44" width="108" height="22" />
      <rect x="-38" y="-66" width="76" height="22" />
      <rect x="-20" y="-96" width="40" height="30" />
      <path d="M0 -124 L20 -96 L-20 -96 Z" />
      <circle cx="0" cy="-82" r="3" fill="#f2a649" opacity="0.9" />
    </g>
  )
}

/** Руина колоннады: ряд арок с обломанным краем. */
function Colonnade({ scale }: { scale: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <rect x="-76" y="-10" width="152" height="12" />
      {[-70, -42, -14, 14, 42].map((cx, i) => (
        <rect key={i} x={cx} y="-44" width="12" height="34" />
      ))}
      <rect x="-76" y="-52" width="104" height="9" />
      <rect x="34" y="-38" width="12" height="28" />
      <rect x="58" y="-28" width="10" height="18" />
    </g>
  )
}

/** Тонкая башня-минарет. */
function Minaret({ height }: { height: number }) {
  return (
    <g>
      <rect x="-5" y={-height} width="10" height={height} />
      <path d={`M0 ${-height - 20} L7 ${-height} L-7 ${-height} Z`} />
      <rect x="-9" y={-height + 14} width="18" height="4" />
    </g>
  )
}

/** Плоское дерево-зонтик. */
function Tree({ scale }: { scale: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <rect x="-2" y="-26" width="4" height="27" />
      <path d="M0 -50 L26 -30 L14 -24 L20 -18 L-20 -18 L-14 -24 L-26 -30 Z" />
    </g>
  )
}

function Moon({ uid }: { uid: string }) {
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
        <mask id={`crescent-${uid}`}>
          <rect width="46" height="46" fill="#000" />
          <circle cx="23" cy="23" r="15" fill="#fff" />
          <circle cx="30" cy="18" r="14" fill="#000" />
        </mask>
      </defs>
      <circle cx="23" cy="23" r="15" fill="#f6e3d2" mask={`url(#crescent-${uid})`} />
    </svg>
  )
}

function FarBalloon({
  top,
  size,
  duration,
  delay = 0,
  color,
}: {
  top: number
  size: number
  duration: number
  delay?: number
  color: string
}) {
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 34 48"
      fill={color}
      style={{
        position: 'absolute',
        top,
        left: 0,
        opacity: 0.9,
        animation: `driftFar ${duration}s linear ${delay}s infinite`,
      }}
    >
      <path d="M17 2c8 0 15 6 15 14 0 8-7 15-11 20h-8C9 31 2 24 2 16 2 8 9 2 17 2z" />
      <rect x="13" y="38" width="8" height="6" rx="1" />
    </svg>
  )
}

function Birds({
  top,
  scale,
  duration,
  delay,
  color,
}: {
  top: number
  scale: number
  duration: number
  delay: number
  color: string
}) {
  return (
    <svg
      width="74"
      height="26"
      viewBox="0 0 74 26"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      style={{
        position: 'absolute',
        top,
        left: 0,
        opacity: 0.7,
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
        opacity: 0.14,
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
