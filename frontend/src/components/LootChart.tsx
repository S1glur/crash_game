/**
 * Распределение вероятности позиции бустера по уровням — прямо из
 * loot_probabilities в config/game.json. Меняется конфиг — меняется график,
 * это наглядная демонстрация сценария 5 (управление параметрами).
 */
export function LootChart({ probabilities }: { probabilities: number[] }) {
  const max = Math.max(...probabilities, 0.01)

  return (
    <div className="panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="label">Где вероятнее бустер</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.45 }}>
          уровень разыгрывается сервером до взлёта
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 48 }}>
        {probabilities.map((value, index) => {
          const share = value / max
          return (
            <div
              key={index}
              title={`Уровень ${index + 1}: ${Math.round(value * 100)} %`}
              style={{
                flexGrow: 1,
                height: `${Math.max(12, share * 100)}%`,
                background: share > 0.85 ? 'var(--amber)' : share > 0.6 ? '#8a6a8e' : '#4e4874',
              }}
            />
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {probabilities.map((value, index) => (
          <span
            key={index}
            style={{
              flexGrow: 1,
              textAlign: 'center',
              fontSize: 10.5,
              fontWeight: value / max > 0.85 ? 700 : 600,
              color: value / max > 0.85 ? 'var(--amber)' : 'rgba(242,234,219,.45)',
            }}
          >
            {index + 1}
          </span>
        ))}
      </div>
    </div>
  )
}
