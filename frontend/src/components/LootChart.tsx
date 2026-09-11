/**
 * Распределение вероятности позиции бустера по уровням — прямо из
 * loot_probabilities в config/game.json. Меняется конфиг — меняется график,
 * это наглядная демонстрация сценария 5 (управление параметрами).
 */
export function LootChart({ probabilities }: { probabilities: number[] }) {
  const max = Math.max(...probabilities, 0.01)

  return (
    /*
      Блок намеренно плотный: на экране ставки под ним ещё автовывод и кнопка
      «Начать полёт», и в прежних размерах кнопка уходила за нижний край.
      Пояснение ушло вправо одной строкой, столбцы и подписи сжаты.
    */
    <div className="panel" style={{ padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="label">Где вероятнее бустер</span>
        <div className="grow" />
        <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.42 }}>уровень выбирает сервер</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 30 }}>
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

      <div style={{ display: 'flex', gap: 4 }}>
        {probabilities.map((value, index) => (
          <span
            key={index}
            style={{
              flexGrow: 1,
              textAlign: 'center',
              fontSize: 9,
              lineHeight: 1,
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
