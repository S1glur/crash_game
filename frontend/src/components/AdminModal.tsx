import { useEffect, useState } from 'react'
import { fmtMult } from '../utils/format'
import { api } from '../api/client'
import { useGame } from '../store/gameStore'

/**
 * Административная панель. ТЗ называет её «предпочтительным расширенным
 * вариантом» управления параметрами: эксперт меняет экономику игры и сразу
 * видит эффект, не открывая ни редактор, ни файловую систему.
 *
 * Работаем с копией всего конфига и отправляем его целиком, чтобы не потерять
 * поля, которых нет в форме. Проверку значений делает сервер — клиент не
 * должен быть единственным местом, где живут допустимые диапазоны.
 */
export function AdminModal({ onClose }: { onClose: () => void }) {
  const storeConfig = useGame((s) => s.config)
  const reloadConfig = useGame((s) => s.reloadConfig)

  // Structured clone, чтобы правки не протекали в стор до сохранения.
  const [draft, setDraft] = useState<Record<string, any> | null>(
    storeConfig ? structuredClone(storeConfig as unknown as Record<string, any>) : null,
  )
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'ok' | 'error'; text?: string }>({
    kind: 'idle',
  })

  useEffect(() => {
    if (!draft) {
      void api.config().then((c) => setDraft(structuredClone(c as unknown as Record<string, any>)))
    }
  }, [draft])

  if (!draft) return null

  function patch(mutate: (next: Record<string, any>) => void) {
    setDraft((current) => {
      if (!current) return current
      const next = structuredClone(current)
      mutate(next)
      return next
    })
    setStatus({ kind: 'idle' })
  }

  async function save() {
    setStatus({ kind: 'saving' })
    try {
      await api.saveConfig(draft)
      await reloadConfig()
      setStatus({ kind: 'ok', text: 'Сохранено — применится со следующего раунда' })
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message })
    }
  }

  async function revert() {
    const fresh = await api.config()
    setDraft(structuredClone(fresh as unknown as Record<string, any>))
    setStatus({ kind: 'idle' })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: "22px 26px", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
          <div>
            <span className="label">Администрирование</span>
            <h2 style={{ margin: '6px 0 0', fontSize: 22 }}>Параметры игры</h2>
          </div>
          <button className="chip" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <p style={{ fontSize: 12.5, opacity: 0.7, lineHeight: 1.5, margin: '0 0 18px' }}>
          Изменения пишутся в <code>config/game.json</code> и применяются со следующего
          раунда — перезапуск сервера не нужен. Значения проверяются на сервере,
          поэтому неверная настройка не сможет сломать идущую игру.
        </p>

        <Section title="Математическая модель">
          <Field
            label="alpha (преимущество организатора)"
            hint={`Медиана краха ${fmtMult(draft.crash_model.alpha * 2)}×. Каждый раунд с вероятностью ${Math.round((1 - draft.crash_model.alpha) * 100)} % лопнет сразу на 1,00×`}
            value={draft.crash_model.alpha}
            step={0.01}
            onChange={(v) => patch((n) => (n.crash_model.alpha = v))}
          />
          <Field
            label="Начальная скорость роста"
            hint="Ниже — больше времени на решение в начале полёта"
            value={draft.crash_model.multiplier_growth_rate}
            step={0.01}
            onChange={(v) => patch((n) => (n.crash_model.multiplier_growth_rate = v))}
          />
          <Field
            label="Разгон полёта"
            hint="Во сколько раз скорость растёт за секунду. 1.0 — без разгона"
            value={draft.crash_model.growth_acceleration_base}
            step={0.01}
            onChange={(v) => patch((n) => (n.crash_model.growth_acceleration_base = v))}
          />
          <Field
            label="Максимальный коэффициент"
            value={draft.crash_model.max_multiplier}
            step={1}
            onChange={(v) => patch((n) => (n.crash_model.max_multiplier = v))}
          />
          <Field
            label="Минимальный коэффициент краха"
            value={draft.crash_model.min_crash_multiplier}
            step={0.01}
            onChange={(v) => patch((n) => (n.crash_model.min_crash_multiplier = v))}
          />
        </Section>

        <Section title="Начисление очков">
          <Field
            label="За пройденный уровень"
            value={draft.points.points_per_line}
            step={1}
            onChange={(v) => patch((n) => (n.points.points_per_line = v))}
          />
          <Field
            label="Бонус за «Забрать»"
            value={draft.points.points_cashout_bonus}
            step={1}
            onChange={(v) => patch((n) => (n.points.points_cashout_bonus = v))}
          />
          <Field
            label="Бонус за бустер"
            value={draft.points.points_boost_bonus}
            step={1}
            onChange={(v) => patch((n) => (n.points.points_boost_bonus = v))}
          />
        </Section>

        <Section title="Множители бустеров">
          {Object.keys(draft.boost_tiers).map((key) => (
            <Field
              key={key}
              label={key.replace('multiplier_tier_', 'Тир ').replace('_value', '')}
              value={draft.boost_tiers[key]}
              step={0.5}
              onChange={(v) => patch((n) => (n.boost_tiers[key] = v))}
            />
          ))}
        </Section>

        <Section title="Границы ставки">
          <Field
            label="Минимальная ставка"
            value={draft.stake?.min ?? 0}
            step={5}
            onChange={(v) => patch((n) => (n.stake.min = v))}
          />
          <Field
            label="Максимальная ставка"
            value={draft.stake?.max ?? 0}
            step={50}
            onChange={(v) => patch((n) => (n.stake.max = v))}
          />
          <Field
            label="Шаг ставки"
            value={draft.stake?.step ?? 0}
            step={5}
            onChange={(v) => patch((n) => (n.stake.step = v))}
          />
        </Section>

        <Section title="Цена бустеров (доля от ставки)">
          {(draft.boost_options ?? []).map((option: any, index: number) => (
            <Field
              key={option.id}
              label={`${option.id} (×${option.boost_tier})`}
              hint={
                `доплата = ставка × ${option.price_factor}. ` +
                `Честная цена — ${option.boost_tier - 1}: при ней бустер перестаёт быть выгодным`
              }
              value={option.price_factor}
              step={0.1}
              onChange={(v) => patch((n) => (n.boost_options[index].price_factor = v))}
            />
          ))}
        </Section>

        <Section title="Апсейл «Закрепи успех»">
          <Field
            label="Минимальный выигрыш для попапа"
            hint="MIN_WIN_AMOUNT: ниже этой суммы предложение не показывается"
            value={draft.upsell?.min_win_amount ?? 0}
            step={10}
            onChange={(v) => patch((n) => (n.upsell.min_win_amount = v))}
          />
          <Field
            label="Автозакрытие попапа, сек"
            hint="POPUP_TIMEOUT"
            value={draft.upsell?.popup_timeout_sec ?? 0}
            step={1}
            onChange={(v) => patch((n) => (n.upsell.popup_timeout_sec = v))}
          />
        </Section>

        <Section title="Длительность фаз">
          {/*
            Здесь раньше стояла ручка «автопереход с экрана результата». Она
            правила ui.result_screen_auto_advance_sec — параметр, который не
            читает ни экран, ни сервер: показ итога заканчивается вместе с
            фазой раунда. Крутить её можно было сколько угодно без эффекта.
          */}
          <Field
            label="Приём ставок, сек"
            hint="Сколько времени есть, чтобы присоединиться к раунду"
            value={draft.round_cycle?.betting_seconds ?? 0}
            step={1}
            onChange={(v) => patch((n) => (n.round_cycle.betting_seconds = v))}
          />
          <Field
            label="Показ итога, сек"
            hint="Секунду из них съедает разрыв шара — столько таблица результата и висит"
            value={draft.round_cycle?.result_seconds ?? 0}
            step={1}
            onChange={(v) => patch((n) => (n.round_cycle.result_seconds = v))}
          />
        </Section>

        <Section title="Прочее">
          <Field
            label="Стартовый баланс демо-игрока"
            hint="Применится при следующем создании игрока (после перезапуска сервера)"
            value={draft.demo_user?.starting_balance ?? 0}
            step={100}
            onChange={(v) => patch((n) => (n.demo_user.starting_balance = v))}
          />
        </Section>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 22,
            flexWrap: 'wrap',
          }}
        >
          <button
            className="btn-primary"
            onClick={() => void save()}
            disabled={status.kind === 'saving'}
          >
            {status.kind === 'saving' ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button className="chip" onClick={() => void revert()}>
            Вернуть сохранённые
          </button>

          {status.text && (
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: status.kind === 'error' ? 'var(--bordeaux-lt)' : 'var(--amber)',
              }}
            >
              {status.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <span className="label" style={{ display: 'block', marginBottom: 10 }}>
        {title}
      </span>
      <div className="admin-grid">{children}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  value,
  step,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          /*
            Пустое поле — это не ноль. Number('') возвращает 0, а не NaN, и
            прежняя проверка на NaN его пропускала: стоило стереть значение,
            чтобы набрать новое, как в черновик уезжал ноль. Для alpha сервер
            такое отклоняет, а для «очков за уровень» ноль допустим — и
            начисление молча выключалось.

            Пока поле пустое, прежнее значение остаётся в силе: браузер
            показывает пустую строку, сохранять нечего.
          */
          const raw = e.target.value.trim()
          if (raw === '') return
          const parsed = Number(raw)
          if (Number.isFinite(parsed)) onChange(parsed)
        }}
        style={{
          font: 'inherit',
          fontWeight: 700,
          padding: '8px 10px',
          background: 'rgba(16,13,32,.6)',
          color: 'var(--cream)',
          border: '1px solid var(--line)',
          borderRadius: 3,
        }}
      />
      {hint && <span style={{ fontSize: 11, opacity: 0.55, lineHeight: 1.4 }}>{hint}</span>}
    </label>
  )
}
