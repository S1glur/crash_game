import { useId, useMemo } from 'react'
import type { Theme } from '../api/types'

/**
 * Фоновая сцена: сумеречное небо, светило за дворцом, четыре силуэтных слоя
 * гор с постройками и деревьями. Слои сдвигаются вниз по мере подъёма шара —
 * так «камера» следует за ним, не двигая сам шар (дёшево по кадрам, см.
 * требование 60 fps).
 *
 * Горы рисуются растянутыми на всю ширину (preserveAspectRatio="none") — для
 * ломаной линии хребта это незаметно. А вот постройки и деревья так рисовать
 * нельзя: их бы расплющивало тем сильнее, чем шире экран. Поэтому они —
 * отдельные элементы фиксированного размера, привязанные к своему хребту
 * процентом по горизонтали и пикселями от низа.
 */

/** Высота силуэтных слоёв. Координаты объектов считаются от неё. */
const LAYER_H = 400

export function Scene({
  theme,
  lift = 0,
  dimmed = false,
}: {
  theme: Theme
  lift?: number
  dimmed?: boolean
}) {
  const uid = useId().replace(/:/g, '')

  // Позиции звёзд генерируются один раз на монтирование — при каждом заходе новые.
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
   * Птицы и облака: количество и позиции разыгрываются заново при каждом заходе
   * на экран, по 1–3 штуки каждого — как требует §1.1 ТЗ. Птицы летят заметно
   * быстрее облаков, за счёт этого читается глубина сцены.
   *
   * Высота выбрана так, чтобы силуэты попадали на светлую часть неба у горизонта:
   * выше, в тёмной зоне, тёмная птица просто не видна.
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

  /** Дальние шары — тоже каждый раз в новом составе, 2–4 штуки. */
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

  // Палитра слоёв: от дымчатого дальнего к почти чёрному ближнему. Разрыв
  // между соседними слоями и есть то, что читается как глубина.
  const ridge = isGreen
    ? ['#5c7b86', '#3c5a6b', '#263c4f', '#142130']
    : ['#7b5f7e', '#4d4068', '#2e2648', '#18132c']

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
      {/* небо */}
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

      {/*
        Светило садится ровно за дворцом: силуэт постройки на светлом диске —
        главный приём композиции в референсе, без него дворец теряется на фоне
        гор одного с ним тона.
      */}
      <div
        style={{
          position: 'absolute',
          left: '45%',
          bottom: LAYER_H - 300,
          width: 210,
          height: 210,
          transform: `translate(-50%, ${lift * 0.5}px)`,
          transition: 'transform .16s linear',
          borderRadius: '50%',
          background: isGreen
            ? 'radial-gradient(circle, #fdf3d8 0%, #f7e3b0 52%, rgba(247,227,176,0) 72%)'
            : 'radial-gradient(circle, #fff1e2 0%, #ffcfa8 50%, rgba(255,207,168,0) 72%)',
        }}
      />

      {/* Дымка у горизонта — то, что отделяет дальние хребты от ближних. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: LAYER_H - 300,
          height: 220,
          transform: `translateY(${lift * 0.35}px)`,
          transition: 'transform .16s linear',
          background: isGreen
            ? 'linear-gradient(180deg, rgba(226,205,155,0) 0%, rgba(226,205,155,.28) 62%, rgba(226,205,155,.42) 100%)'
            : 'linear-gradient(180deg, rgba(255,186,146,0) 0%, rgba(255,170,140,.26) 60%, rgba(255,160,135,.4) 100%)',
        }}
      />

      {clouds.map((cloud, i) => (
        <Cloud key={i} {...cloud} />
      ))}

      {/* --- дальний хребет --- */}
      <Layer
        lift={lift * 0.25}
        color={ridge[0]}
        opacity={0.55}
        path="M0 214 L156 138 L258 196 L378 108 L508 214 L634 154 L760 228 L890 140 L1016 220 L1150 132 L1274 206 L1392 156 L1440 200 L1440 400 L0 400 Z"
      />
      <RidgeObject leftPct={10.4} bottom={LAYER_H - 140} lift={lift * 0.25} color={ridge[0]} opacity={0.6}>
        <Minaret height={62} />
      </RidgeObject>
      <RidgeObject leftPct={27.9} bottom={LAYER_H - 112} lift={lift * 0.25} color={ridge[0]} opacity={0.6}>
        <Minaret height={50} />
      </RidgeObject>
      <RidgeObject leftPct={79.9} bottom={LAYER_H - 136} lift={lift * 0.25} color={ridge[0]} opacity={0.6}>
        <Minaret height={58} />
      </RidgeObject>
      <RidgeObject leftPct={88.5} bottom={LAYER_H - 208} lift={lift * 0.25} color={ridge[0]} opacity={0.6}>
        <Minaret height={40} />
      </RidgeObject>

      {/* --- средний хребет с дворцом --- */}
      <Layer
        lift={lift * 0.5}
        color={ridge[1]}
        opacity={0.92}
        path="M0 272 L134 202 L280 268 L420 186 L562 276 L708 210 L850 284 L996 204 L1140 274 L1278 216 L1440 268 L1440 400 L0 400 Z"
      />
      <RidgeObject leftPct={45} bottom={LAYER_H - 276} lift={lift * 0.5} color={ridge[1]} opacity={1}>
        <Palace />
      </RidgeObject>

      {farBalloons.map((balloon, i) => (
        <FarBalloon key={i} {...balloon} color={ridge[1]} />
      ))}

      {birds.map((bird, i) => (
        <Birds key={i} {...bird} color={ridge[2]} />
      ))}

      {/* --- ближний хребет с деревьями --- */}
      <Layer
        lift={lift * 0.78}
        color={ridge[2]}
        opacity={1}
        path="M0 330 L176 274 L334 328 L492 266 L650 336 L810 278 L968 340 L1128 282 L1288 336 L1440 298 L1440 400 L0 400 Z"
      />
      <RidgeObject leftPct={16.1} bottom={LAYER_H - 300} lift={lift * 0.78} color={ridge[2]} opacity={1}>
        <Tree scale={1} />
      </RidgeObject>
      <RidgeObject leftPct={82.4} bottom={LAYER_H - 306} lift={lift * 0.78} color={ridge[2]} opacity={1}>
        <Tree scale={0.82} />
      </RidgeObject>
      <RidgeObject leftPct={88.1} bottom={LAYER_H - 320} lift={lift * 0.78} color={ridge[2]} opacity={1}>
        <Tree scale={1.1} />
      </RidgeObject>

      {/* --- передний план --- */}
      <Layer
        lift={lift}
        color={ridge[3]}
        opacity={1}
        path="M0 378 C196 352 356 384 552 368 C748 352 888 386 1084 372 C1248 360 1356 380 1440 370 L1440 400 L0 400 Z"
      />

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
        <path d="M-10 16 C240 70 560 80 860 52 C1100 30 1310 36 1450 22" stroke={ridge[3]} strokeWidth="2" />
        <g fill={ridge[2]}>
          {BUNTING.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
    </div>
  )
}

/** Силуэт хребта. Растягивается по ширине — для ломаной линии это незаметно. */
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
      viewBox={`0 0 1440 ${LAYER_H}`}
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: LAYER_H,
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

/**
 * Постройка или дерево на конкретном хребте: фиксированный размер (не тянется
 * вместе с экраном), позиция — процентом по горизонтали, чтобы совпадать с той
 * же точкой растянутой линии хребта, и тем же сдвигом при подъёме.
 */
function RidgeObject({
  leftPct,
  bottom,
  lift,
  color,
  opacity,
  children,
}: {
  leftPct: number
  bottom: number
  lift: number
  color: string
  opacity: number
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        bottom,
        transform: `translate(-50%, ${lift}px)`,
        transition: 'transform .16s linear',
        color,
        opacity,
        lineHeight: 0,
      }}
    >
      {children}
    </div>
  )
}

/** Дворец: терраса, колоннада, башня со шпилем и горящие окна. */
function Palace() {
  const columns = Array.from({ length: 9 }, (_, i) => 18 + i * 27)
  const windows = Array.from({ length: 5 }, (_, i) => 84 + i * 22)

  return (
    <svg width="264" height="232" viewBox="0 0 264 232" fill="currentColor">
      {/* нижняя терраса */}
      <rect x="0" y="206" width="264" height="20" />
      {columns.map((cx, i) => (
        <rect key={i} x={cx} y="180" width="11" height="26" />
      ))}
      <rect x="12" y="172" width="240" height="10" />

      {/* верхний ярус */}
      <rect x="46" y="146" width="172" height="26" />
      <rect x="60" y="132" width="144" height="16" />

      {/* зубцы */}
      {[48, 66, 84, 180, 198, 216].map((bx, i) => (
        <rect key={i} x={bx} y="124" width="10" height="12" />
      ))}

      {/* центральная башня */}
      <rect x="102" y="74" width="60" height="58" />
      <path d="M132 28 L154 58 L154 74 L110 74 L110 58 Z" />
      <rect x="129" y="0" width="6" height="30" />
      <path d="M135 2 L166 10 L135 18 Z" />

      {/* горящие окна — тёплые точки, главная деталь силуэта */}
      {windows.map((wx, i) => (
        <circle key={i} cx={wx} cy="162" r="3.4" fill="#f2a649" opacity="0.95" />
      ))}
    </svg>
  )
}

/** Тонкая башня-минарет для дальнего плана. */
function Minaret({ height }: { height: number }) {
  return (
    <svg width="20" height={height + 22} viewBox={`0 0 20 ${height + 22}`} fill="currentColor">
      <rect x="5" y="20" width="10" height={height} />
      <path d={`M10 0 L17 20 L3 20 Z`} />
      <rect x="1" y="34" width="18" height="4" />
    </svg>
  )
}

/** Плоское дерево-зонтик из палитры Alto. */
function Tree({ scale }: { scale: number }) {
  return (
    <svg
      width={54 * scale}
      height={52 * scale}
      viewBox="0 0 54 52"
      fill="currentColor"
      style={{ display: 'block' }}
    >
      <rect x="25" y="26" width="4" height="26" />
      <path d="M27 2 L53 22 L41 28 L47 34 L7 34 L13 28 L1 22 Z" />
    </svg>
  )
}

/** Растущий месяц. */
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

/**
 * Стайка птиц. Летит заметно быстрее облаков — за счёт разницы скоростей
 * читается глубина (§1.1 ТЗ).
 */
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
