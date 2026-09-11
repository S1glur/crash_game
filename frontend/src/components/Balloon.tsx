import { useId } from 'react'
import type { Theme } from '../api/types'

const ENVELOPE =
  'M70 6 C104 6 130 32 130 66 C130 96 104 124 82 148 L58 148 C36 124 10 96 10 66 C10 32 36 6 70 6 Z'

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
  const body = theme === 'green' ? '#2c6b52' : '#8c2f3a'
  const shade = theme === 'green' ? '#101a16' : '#1a1428'

  if (popped) {
    return (
      <svg width={width} height={width * 0.82} viewBox="0 0 60 50" fill="none">
        <path d="M8 8 C17 3 27 6 31 14 C22 20 12 18 8 8 Z" fill={body} />
        <path d="M36 20 C45 16 54 21 54 29 C45 33 37 28 36 20 Z" fill="#f2eadb" opacity=".7" />
        <rect x="22" y="34" width="16" height="11" rx="2" fill="#241e36" />
      </svg>
    )
  }

  return (
    <svg
      width={width}
      height={width * 1.357}
      viewBox="0 0 140 190"
      fill="none"
      style={{ animation: bob ? 'bob 6.8s ease-in-out infinite' : undefined }}
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
