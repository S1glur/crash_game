import { useId, useMemo, type ReactNode } from 'react'
import type { Theme } from '../api/types'

/**
 * Фоновая сцена: сумеречное небо, светило за дворцом и четыре силуэтных плана
 * с постройками.
 *
 * Три решения, на которых всё держится:
 *
 * 1. Хребет и всё, что на нём стоит, живут в ОДНОЙ системе координат. Линия
 *    хребта задана массивом точек, а высота под постройкой берётся из этой же
 *    ломаной функцией yAt().
 *
 * 2. Под каждой постройкой в хребте вырезана ровная площадка — terrace(). Одного
 *    совпадения высот мало: у здания плоское широкое основание, и на острие пика
 *    оно опирается лишь центром, а по краям под ним видно небо — именно это и
 *    читается как «дворец парит». Площадка шире основания, поэтому опора есть
 *    по всей ширине. Ширина площадки берётся из тех же данных, что и позиция,
 *    так что нарисовать постройку без земли под ней структурно невозможно.
 *
 * 3. preserveAspectRatio="xMidYMax slice" — масштаб одинаков по обеим осям.
 *    Прежний "none" тянул viewBox по ширине экрана: ломаной горы это незаметно,
 *    а дворец расплющивало тем сильнее, чем шире монитор.
 *
 * Ощущение высоты даёт не подъём шара по экрану, а то, что планы одновременно
 * уходят вниз и уменьшаются — чем ближе план, тем сильнее. Так работает
 * настоящий отлёт камеры от земли.
 */

type Point = [x: number, y: number]

/** Постройка на хребте: позиция, полуширина площадки под ней и сама фигура. */
type Site = { x: number; half: number; el: ReactNode }

/** Высота системы координат сцены. Низ viewBox — низ экрана. */
const SCENE_H = 400

/** Насколько план уезжает вниз на полной высоте полёта, пиксели viewBox. */
const DRIFT = 150

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

/**
 * Вырезает в хребте ровные площадки под постройки: участок [x-half, x+half]
 * заменяется горизонталью на высоте склона в центре площадки. Заливка идёт до
 * низа кадра, поэтому под площадкой всегда сплошная порода — зданию есть на чём
 * стоять по всей ширине основания.
 */
function terrace(points: Point[], sites: Site[]): Point[] {
  let out = points
  for (const site of sites) {
    const left = Math.max(0, site.x - site.half)
    const right = Math.min(1440, site.x + site.half)
    const y = yAt(out, site.x)
    out = [
      ...out.filter(([px]) => px < left),
      [left, y] as Point,
      [right, y] as Point,
      ...out.filter(([px]) => px > right),
    ]
  }
  return out
}

/*
  Деревья: ставятся так же, как постройки, только площадка под ними
  символическая — ствол узкий, ему хватает пары десятков пикселей.
  Полуширина считается от масштаба, чтобы крупное дерево не оказалось на
  площадке от мелкого.
*/
const tree = (x: number, scale: number): Site => ({ x, half: 10 * scale, el: <Tree scale={scale} /> })
const cypress = (x: number, scale: number): Site => ({ x, half: 8 * scale, el: <Cypress scale={scale} /> })
const palm = (x: number, scale: number): Site => ({ x, half: 9 * scale, el: <Palm scale={scale} /> })

/** Дворец стоит на плато среднего хребта — вокруг него строится композиция. */
const PALACE_X = 688

/* --- дальний план: мелкие храмы, башни и редкая поросль --- */

const RIDGE_FAR: Point[] = [
  [0, 216], [52, 164], [104, 198], [166, 116], [212, 158], [256, 194],
  [314, 130], [360, 166], [378, 152], [458, 150], [504, 186], [552, 142],
  [604, 178], [658, 132], [708, 174], [762, 140], [814, 186], [868, 148],
  [912, 120], [962, 174], [1016, 202], [1062, 150], [1088, 138], [1172, 136],
  [1216, 172], [1262, 198], [1300, 130], [1350, 176], [1398, 150], [1440, 192],
]

const FAR_SITES: Site[] = [
  { x: 166, half: 9, el: <Minaret height={44} /> },
  { x: 418, half: 36, el: <Temple scale={0.5} /> },
  { x: 468, half: 9, el: <Minaret height={34} /> },
  { x: 904, half: 9, el: <Minaret height={40} /> },
  { x: 1130, half: 38, el: <Ziggurat scale={0.46} /> },
  { x: 1296, half: 9, el: <Minaret height={36} /> },
  tree(76, 0.5), tree(236, 0.45), cypress(590, 0.5), tree(744, 0.45),
  tree(986, 0.5), cypress(1234, 0.45), tree(1418, 0.5),
]

/* --- средний план: дворец на плато, храмы, зиккурат --- */

const RIDGE_MID: Point[] = [
  [0, 286], [58, 242], [112, 274], [148, 254], [264, 252], [296, 284],
  [348, 234], [396, 220], [440, 262], [492, 236], [536, 262], [560, 246],
  [582, 226], [794, 226], [816, 250], [860, 272], [900, 240], [920, 228],
  [1056, 230], [1092, 268], [1144, 238], [1194, 274], [1236, 246], [1340, 244],
  [1384, 276], [1440, 252],
]

const MID_SITES: Site[] = [
  { x: 206, half: 52, el: <Temple scale={0.72} /> },
  { x: 396, half: 9, el: <Minaret height={54} /> },
  { x: PALACE_X, half: 106, el: <Palace scale={0.75} /> },
  { x: 988, half: 64, el: <Ziggurat scale={0.8} /> },
  { x: 1288, half: 48, el: <Temple scale={0.66} /> },
  tree(28, 0.6), tree(86, 0.55), cypress(320, 0.6), tree(456, 0.55),
  tree(512, 0.5), tree(848, 0.6), cypress(1076, 0.55), tree(1168, 0.5),
  tree(1408, 0.55),
]

/* --- ближний план: руины колоннады, храм и роща --- */

const RIDGE_NEAR: Point[] = [
  [0, 342], [70, 300], [138, 338], [204, 288], [266, 328], [326, 350],
  [352, 330], [372, 316], [528, 316], [548, 332], [574, 352], [630, 306],
  [690, 342], [748, 302], [808, 340], [862, 358], [918, 314], [958, 302],
  [1046, 304], [1088, 346], [1148, 306], [1210, 342], [1266, 358], [1328, 316],
  [1384, 346], [1440, 324],
]

const NEAR_SITES: Site[] = [
  { x: 450, half: 78, el: <Colonnade scale={0.9} /> },
  { x: 1002, half: 40, el: <Temple scale={0.54} /> },
  tree(34, 0.9), cypress(96, 0.75), tree(172, 1), tree(238, 0.85),
  palm(296, 0.95), cypress(344, 0.7), tree(560, 0.8), tree(606, 1.05),
  palm(664, 0.85), tree(720, 1), tree(780, 0.9), cypress(838, 0.75),
  tree(890, 1.05), palm(934, 0.8), tree(1066, 0.9), cypress(1118, 0.75),
  tree(1178, 1), palm(1240, 0.85), tree(1298, 0.95), cypress(1356, 0.8),
  tree(1416, 0.9),
]

/* --- передний план: плотная древесная кромка --- */

const RIDGE_FRONT: Point[] = [
  [0, 386], [92, 360], [186, 384], [280, 356], [374, 382], [468, 354],
  [562, 382], [656, 358], [750, 384], [844, 356], [938, 382], [1032, 354],
  [1126, 382], [1220, 358], [1314, 382], [1408, 358], [1440, 372],
]

const FRONT_SITES: Site[] = [
  tree(44, 1.1), tree(128, 1.35), palm(214, 0.95), tree(300, 1.25),
  cypress(386, 1), tree(462, 1.3), palm(542, 1.05), tree(620, 1.2),
  tree(700, 1.35), cypress(782, 1), tree(856, 1.25), palm(938, 1.1),
  tree(1016, 1.3), cypress(1096, 0.95), tree(1172, 1.2), tree(1254, 1.35),
  palm(1330, 1.05), tree(1412, 1.15),
]

/*
  Площадки вырезаются один раз при загрузке модуля: и силуэт горы, и опора под
  постройкой берутся из одного и того же результата.
*/
const FAR = terrace(RIDGE_FAR, FAR_SITES)
const MID = terrace(RIDGE_MID, MID_SITES)
const NEAR = terrace(RIDGE_NEAR, NEAR_SITES)
const FRONT = terrace(RIDGE_FRONT, FRONT_SITES)

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

  const sunY = yAt(MID, PALACE_X) - 58

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

      <Plane height={height} depth={0.24} shrink={0.05}>
        <Ridge points={FAR} sites={FAR_SITES} fill={ridge[0]} opacity={0.62} />
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

      <Plane height={height} depth={0.62} shrink={0.15}>
        <Ridge points={MID} sites={MID_SITES} fill={ridge[1]} />
      </Plane>

      {farBalloons.map((balloon, i) => (
        <FarBalloon key={i} {...balloon} color={ridge[1]} />
      ))}

      {birds.map((bird, i) => (
        <Birds key={i} {...bird} color={ridge[2]} />
      ))}

      <Plane height={height} depth={0.82} shrink={0.24}>
        <Ridge points={NEAR} sites={NEAR_SITES} fill={ridge[2]} />
      </Plane>

      <Plane height={height} depth={1} shrink={0.32}>
        <Ridge points={FRONT} sites={FRONT_SITES} fill={ridge[3]} />
      </Plane>
    </div>
  )
}

/**
 * Хребет вместе со своими постройками. Позиция каждой фигуры берётся из той же
 * ломаной, которая только что нарисовала гору, — разъехаться им негде.
 */
function Ridge({
  points,
  sites,
  fill,
  opacity,
}: {
  points: Point[]
  sites: Site[]
  fill: string
  opacity?: number
}) {
  return (
    <g fill={fill} opacity={opacity}>
      <path d={ridgePath(points)} />
      {sites.map((site, i) => (
        <g key={i} transform={`translate(${site.x} ${yAt(points, site.x)})`}>
          {site.el}
        </g>
      ))}
    </g>
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

/** Дворец: терраса, колоннада, верхний ярус с зубцами, башня со шпилем. */
function Palace({ scale = 1 }: { scale?: number }) {
  const columns = Array.from({ length: 9 }, (_, i) => -108 + i * 27)
  const windows = Array.from({ length: 5 }, (_, i) => -44 + i * 22)

  return (
    <g transform={`scale(${scale})`}>
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
      <rect x="-5" y={-height} width="10" height={height + 1} />
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

/** Кипарис: узкий вертикальный силуэт — разбивает ряд зонтичных крон. */
function Cypress({ scale }: { scale: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <rect x="-1.6" y="-14" width="3.2" height="15" />
      <path d="M0 -54 C8.5 -41 9.5 -25 0 -11 C-9.5 -25 -8.5 -41 0 -54 Z" />
    </g>
  )
}

/** Пальма: наклонный ствол и веер листьев — пустынный акцент. */
function Palm({ scale }: { scale: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <path d="M-2 1 C-3 -14 1 -26 4 -38 L9 -37 C5 -25 3 -13 3.5 1 Z" />
      <path d="M7 -38 C17 -44 27 -42 33 -34 C25 -38 15 -37 8 -33 Z" />
      <path d="M7 -39 C15 -50 27 -52 34 -47 C25 -47 15 -44 9 -36 Z" />
      <path d="M4 -39 C-4 -49 -16 -51 -24 -46 C-14 -46 -5 -43 1 -35 Z" />
      <path d="M3 -38 C-6 -43 -18 -42 -25 -33 C-16 -37 -7 -36 1 -33 Z" />
      <circle cx="5" cy="-39" r="2.6" />
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
