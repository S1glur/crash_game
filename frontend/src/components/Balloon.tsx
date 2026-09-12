import { useId, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { Theme } from '../api/types'

const ENVELOPE =
  'M70 6 C104 6 130 32 130 66 C130 96 104 124 82 148 L58 148 C36 124 10 96 10 66 C10 32 36 6 70 6 Z'

/** Центр разрыва — примерно середина купола, откуда расходятся клочья. */
const BURST = { x: 70, y: 74 }

/**
 * Контур купола, разложенный на точки. Клочья строятся как сектора от центра
 * разрыва к соседним точкам контура: получается не абстрактная россыпь, а
 * именно та оболочка, что секунду назад была целой.
 */
const RING: [number, number][] = [
  [70, 6],
  [110, 16],
  [130, 56],
  [112, 104],
  [82, 148],
  [58, 148],
  [28, 104],
  [10, 56],
  [30, 16],
]

type Shard = { d: string; style: CSSProperties; stripe: boolean }

/**
 * Клочья разлетаются от центра разрыва, а не в случайные стороны: направление
 * задаёт вектор наружу, а дальность и вращение — свои у каждого лоскута.
 * Значения детерминированные: разрыв должен выглядеть одинаково в каждом
 * раунде, а не пересобираться при каждой перерисовке.
 */
const SHARDS: Shard[] = RING.map((point, i) => {
  const next = RING[(i + 1) % RING.length]
  const midX = (point[0] + next[0]) / 2
  const midY = (point[1] + next[1]) / 2
  const dx = midX - BURST.x
  const dy = midY - BURST.y
  const length = Math.hypot(dx, dy) || 1
  const throwBy = 52 + ((i * 37) % 46)
  const spin = ((i * 53) % 140) - 70
  return {
    d: 'M' + BURST.x + ' ' + BURST.y + ' L' + point[0] + ' ' + point[1] + ' L' + next[0] + ' ' + next[1] + ' Z',
    stripe: i % 2 === 1,
    style: {
      transformBox: 'fill-box',
      transformOrigin: 'center',
      animation: 'shardFly .95s cubic-bezier(.16,.7,.32,1) .07s both',
      '--tx': ((dx / length) * throwBy).toFixed(1) + 'px',
      // Вверх клочья летят охотнее, чем вниз: горячий воздух ещё выходит.
      '--ty': ((dy / length) * throwBy - 14).toFixed(1) + 'px',
      '--rot': spin + 'deg',
    } as CSSProperties,
  }
})

/** Искры от горелки — мелкие, летят дальше клочьев и гаснут раньше. */
const EMBERS = Array.from({ length: 9 }, (_, i) => {
  const angle = (i / 9) * Math.PI * 2 + 0.4
  const throwBy = 64 + ((i * 29) % 38)
  return {
    cx: BURST.x + Math.cos(angle) * 10,
    cy: BURST.y + Math.sin(angle) * 10,
    r: 1.8 + (i % 3) * 0.9,
    style: {
      transformBox: 'fill-box',
      transformOrigin: 'center',
      animation: 'shardFly ' + (0.62 + (i % 4) * 0.09).toFixed(2) + 's ease-out both',
      '--tx': (Math.cos(angle) * throwBy).toFixed(1) + 'px',
      '--ty': (Math.sin(angle) * throwBy - 18).toFixed(1) + 'px',
      '--rot': '0deg',
      '--sc': '.3',
    } as CSSProperties,
  }
})

/** Полосатый шар-силуэт с горящей горелкой. Один компонент на все экраны. */
export function Balloon({
  theme,
  width = 140,
  bob = true,
  popped = false,
}: {
  theme: Theme
  width?: number
  bob?: boolean
  popped?: boolean
}) {
  const id = useId().replace(/:/g, '')
  // Каждый шар парит со своей длительностью и фазой: ТЗ требует, чтобы
  // движения не были синхронными, иначе два шара рядом качаются как один
  // механизм. Значения фиксируются на монтирование, а не на каждый кадр.
  const float = useMemo(
    () => ({ duration: 5.6 + Math.random() * 3.2, delay: -Math.random() * 4 }),
    [],
  )
  const body = theme === 'green' ? '#2c6b52' : '#8c2f3a'
  const shade = theme === 'green' ? '#101a16' : '#1a1428'

  /*
    Разрыв рисуется в том же viewBox и той же ширины, что целый шар. Раньше
    лопнувший шар подменялся отдельной мелкой картинкой другого формата:
    оболочка не рвалась, а мгновенно исчезала, обломки оказывались выше и
    меньше, чем был шар, и ничто не двигалось. Здесь клочья стартуют ровно
    оттуда, где секунду назад был купол, а корзина падает со своего места.
  */
  if (popped) {
    return (
      <svg width={width} height={width * 1.357} viewBox="0 0 140 190" fill="none">
        <defs>
          <radialGradient id={'flash-' + id}>
            <stop offset="0" stopColor="#fff6e2" stopOpacity="1" />
            <stop offset=".45" stopColor="#f2a649" stopOpacity=".85" />
            <stop offset="1" stopColor="#f2a649" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Вспышка и ударная волна короткие — они только отмечают момент. */}
        <circle
          cx={BURST.x}
          cy={BURST.y}
          r="34"
          fill={'url(#flash-' + id + ')'}
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            animation: 'burstFlash .42s ease-out forwards',
          }}
        />
        <circle
          cx={BURST.x}
          cy={BURST.y}
          r="30"
          fill="none"
          stroke="#f2eadb"
          strokeWidth="3"
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            animation: 'burstRing .55s cubic-bezier(.2,.8,.3,1) forwards',
          }}
        />

        {/* Купол успевает раздуться на один кадр — и рвётся. */}
        <g
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            animation: 'burstPuff .18s ease-out',
          }}
        >
          {SHARDS.map((shard, i) => (
            <path
              key={i}
              d={shard.d}
              fill={shard.stripe ? '#f2eadb' : body}
              stroke={shade}
              strokeWidth=".8"
              strokeLinejoin="round"
              style={shard.style}
            />
          ))}
        </g>

        {EMBERS.map((ember, i) => (
          <circle key={i} cx={ember.cx} cy={ember.cy} r={ember.r} fill="#f2a649" style={ember.style} />
        ))}

        {/*
          Корзина не исчезает: она остаётся на экране весь показ результата.
          По ней видно, что шара больше нет, — а не что экран просто опустел.
        */}
        <g
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            animation: 'burstFall 1.15s cubic-bezier(.4,0,.75,1) forwards',
          }}
        >
          <path d="M58 148 L61 168 M82 148 L79 168" stroke="#241e36" strokeWidth="2" />
          <rect x="55" y="164" width="30" height="19" rx="2" fill="#241e36" />
          <rect x="58" y="166" width="24" height="6" fill="#f2a649" opacity=".5" />
        </g>
      </svg>
    )
  }

  return (
    <svg
      width={width}
      height={width * 1.357}
      viewBox="0 0 140 190"
      fill="none"
      style={{
        animation: bob
          ? `bob ${float.duration.toFixed(2)}s ease-in-out ${float.delay.toFixed(2)}s infinite`
          : undefined,
      }}
    >
      <defs>
        <clipPath id={`env-${id}`}>
          <path d={ENVELOPE} />
        </clipPath>
        <radialGradient id={`glow-${id}`}>
          <stop offset="0" stopColor="#f2a649" stopOpacity=".95" />
          <stop offset="1" stopColor="#f2a649" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g clipPath={`url(#env-${id})`}>
        <rect x="0" y="0" width="140" height="190" fill={body} />
        {[16, 44, 72, 100, 128].map((y) => (
          <rect key={y} x="0" y={y} width="140" height="13" fill="#f2eadb" opacity=".92" />
        ))}
        <path d="M70 0 v190" stroke={shade} strokeWidth="1.2" opacity=".24" />
        <path d="M44 0 C33 44 33 112 50 190" stroke={shade} strokeWidth="1.2" opacity=".18" />
        <path d="M96 0 C107 44 107 112 90 190" stroke={shade} strokeWidth="1.2" opacity=".18" />
        <rect x="0" y="0" width="42" height="190" fill={shade} opacity=".16" />
      </g>

      <path d="M58 148 L61 168 M82 148 L79 168" stroke="#241e36" strokeWidth="2" />
      <ellipse
        cx="70"
        cy="171"
        rx="30"
        ry="17"
        fill={`url(#glow-${id})`}
        style={{ animation: 'flame 1.6s ease-in-out infinite' }}
      />
      <rect x="55" y="164" width="30" height="19" rx="2" fill="#241e36" />
      <rect x="58" y="166" width="24" height="6" fill="#f2a649" />
    </svg>
  )
}
