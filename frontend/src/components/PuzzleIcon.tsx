const PIECE =
  'M4 4 H16 A5 5 0 0 1 28 4 H40 V16 A5 5 0 0 0 40 28 V40 H28 A5 5 0 0 0 16 40 H4 V28 A5 5 0 0 1 4 16 Z'

export function PuzzleIcon({ filled, size = 24 }: { filled?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }}>
      <path
        d={PIECE}
        fill={filled ? 'var(--amber)' : 'none'}
        stroke={filled ? 'none' : 'rgba(242,234,219,.4)'}
        strokeWidth="2"
      />
    </svg>
  )
}
