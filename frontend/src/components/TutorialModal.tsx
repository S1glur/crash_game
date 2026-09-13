import { useEffect, useState } from 'react'
import { sound } from '../utils/sound'

/**
 * Обучение: шесть шагов, по одной мысли на шаг.
 *
 * Почему не подсветка настоящих элементов экрана: она привязывается к вёрстке,
 * ломается от любой перестановки блоков и требует, чтобы нужный экран был уже
 * открыт. Обучение же нужно и до первой ставки, и из полёта. Поэтому каждый шаг
 * несёт схему экрана, на которой видно, о какой его части речь.
 *
 * Текста намеренно мало: заголовок и одна фраза. Всё, что длиннее, живёт в
 * «Правилах» — полный текст остаётся доступен до подтверждения ставки, как
 * требует ТЗ.
 */

const ACCENT = 'var(--amber)'
const DIM = 'rgba(242,234,219,.18)'
const LINE = 'rgba(242,234,219,.32)'

interface Step {
  title: string
  text: string
  figure: React.ReactNode
}

/** Рамка экрана, общая для всех схем: внутри неё рисуется нужная зона. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 320 180" style={{ width: '100%', height: 172, display: 'block' }}>
      <rect x="1" y="1" width="318" height="178" rx="4" fill="rgba(16,13,32,.55)" stroke={LINE} />
      <rect x="12" y="12" width="296" height="18" rx="2" fill={DIM} />
      {children}
    </svg>
  )
}

const STEPS: Step[] = [
  {
    title: 'Раунды идут сами',
    text: 'Приём ставок, полёт, итог — и снова приём. Шар не ждёт игроков.',
    figure: (
      <Frame>
        <rect x="12" y="62" width="88" height="56" rx="3" fill={ACCENT} opacity="0.9" />
        <rect x="116" y="62" width="88" height="56" rx="3" fill={DIM} />
        <rect x="220" y="62" width="88" height="56" rx="3" fill={DIM} />
        <text x="56" y="95" textAnchor="middle" fontSize="11" fontWeight="700" fill="#241e36">ставки</text>
        <text x="160" y="95" textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(242,234,219,.75)">полёт</text>
        <text x="264" y="95" textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(242,234,219,.75)">итог</text>
        <path d="M104 90h8M208 90h8" stroke={LINE} strokeWidth="2" />
      </Frame>
    ),
  },
  {
    title: 'Успейте до взлёта',
    text: 'Пока идёт отсчёт, выберите сумму. Опоздали — ставка сыграет в следующем раунде.',
    figure: (
      <Frame>
        <circle cx="284" cy="21" r="9" fill="none" stroke={ACCENT} strokeWidth="2" />
        <text x="284" y="25" textAnchor="middle" fontSize="10" fontWeight="700" fill={ACCENT}>7</text>
        <rect x="12" y="46" width="180" height="34" rx="3" fill={ACCENT} opacity="0.9" />
        <text x="24" y="68" fontSize="12" fontWeight="700" fill="#241e36">сумма ставки</text>
        <rect x="12" y="92" width="180" height="10" rx="5" fill={DIM} />
        <circle cx="96" cy="97" r="7" fill={ACCENT} />
        <rect x="206" y="46" width="102" height="56" rx="3" fill={DIM} />
      </Frame>
    ),
  },
  {
    title: 'Бустер — отдельная покупка',
    text: 'Он умножит выигрыш, но только если шар дойдёт до его уровня.',
    figure: (
      <Frame>
        <rect x="12" y="46" width="296" height="26" rx="3" fill={DIM} />
        <rect x="12" y="78" width="296" height="26" rx="3" fill={ACCENT} opacity="0.9" />
        <rect x="12" y="110" width="296" height="26" rx="3" fill={DIM} />
        <text x="24" y="63" fontSize="11" fontWeight="700" fill="rgba(242,234,219,.75)">без бустера</text>
        <text x="24" y="95" fontSize="11" fontWeight="700" fill="#241e36">бустер ×2 · сработает на 1,70×</text>
        <text x="24" y="127" fontSize="11" fontWeight="700" fill="rgba(242,234,219,.75)">бустер ×3</text>
      </Frame>
    ),
  },
  {
    title: 'Заберите до краха',
    text: 'Коэффициент растёт, шар лопается в неизвестный момент. Кнопка живёт с первого уровня.',
    figure: (
      <Frame>
        <path d="M20 142 C 90 140, 150 122, 200 72" fill="none" stroke={ACCENT} strokeWidth="3" />
        <path d="M200 72 C 214 54, 224 46, 234 40" fill="none" stroke="var(--bordeaux-lt)" strokeWidth="3" strokeDasharray="5 4" />
        <circle cx="200" cy="72" r="6" fill="var(--cream)" />
        <text x="178" y="60" fontSize="10" fontWeight="700" fill="var(--cream)">забрал</text>
        <circle cx="234" cy="40" r="6" fill="var(--bordeaux-lt)" />
        <text x="246" y="38" fontSize="10" fontWeight="700" fill="var(--bordeaux-lt)">крах</text>
        <rect x="232" y="120" width="76" height="26" rx="3" fill={ACCENT} />
        <text x="270" y="137" textAnchor="middle" fontSize="11" fontWeight="800" fill="#241e36">забрать</text>
      </Frame>
    ),
  },
  {
    title: 'Очки идут за высоту',
    text: 'Каждый пройденный уровень — очки в турнирную таблицу, даже если шар лопнул.',
    figure: (
      <Frame>
        <rect x="12" y="46" width="160" height="90" rx="3" fill={DIM} />
        <rect x="20" y="54" width="144" height="18" rx="2" fill={ACCENT} opacity="0.9" />
        <text x="30" y="67" fontSize="10" fontWeight="700" fill="#241e36">1. вы · 320</text>
        <rect x="20" y="78" width="144" height="18" rx="2" fill="rgba(242,234,219,.1)" />
        <text x="30" y="91" fontSize="10" fontWeight="700" fill="rgba(242,234,219,.7)">2. vip · 280</text>
        <rect x="20" y="102" width="144" height="18" rx="2" fill="rgba(242,234,219,.1)" />
        <text x="30" y="115" fontSize="10" fontWeight="700" fill="rgba(242,234,219,.7)">3. player2 · 150</text>
        <path d="M196 132 v-24 M222 132 v-44 M248 132 v-62 M274 132 v-80" stroke={ACCENT} strokeWidth="7" strokeLinecap="round" opacity="0.75" />
      </Frame>
    ),
  },
  {
    title: 'Две темы — две лестницы',
    text: 'У Изумруда девять уровней, у Бордо двенадцать. И раунды у них разные.',
    figure: (
      <Frame>
        <rect x="12" y="46" width="140" height="90" rx="3" fill="rgba(103,199,155,.18)" stroke="rgba(103,199,155,.5)" />
        <text x="82" y="76" textAnchor="middle" fontSize="12" fontWeight="800" fill="#67c79b">Изумруд</text>
        <text x="82" y="96" textAnchor="middle" fontSize="10" fontWeight="700" fill="rgba(242,234,219,.7)">9 уровней</text>
        <rect x="168" y="46" width="140" height="90" rx="3" fill="rgba(232,117,127,.18)" stroke="rgba(232,117,127,.5)" />
        <text x="238" y="76" textAnchor="middle" fontSize="12" fontWeight="800" fill="#e8757f">Бордо</text>
        <text x="238" y="96" textAnchor="middle" fontSize="10" fontWeight="700" fill="rgba(242,234,219,.7)">12 уровней</text>
      </Frame>
    ),
  },
]

export function TutorialModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const last = step === STEPS.length - 1

  const go = (next: number) => {
    setStep(next)
    sound.select()
  }

  // Стрелки и Escape: обучение листают, а не целятся мышью в мелкие кнопки.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' && step < STEPS.length - 1) go(step + 1)
      if (event.key === 'ArrowLeft' && step > 0) go(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ width: 'min(520px, 100%)' }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Обучение"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '16px 22px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span className="label">Обучение</span>
          <div className="grow" />
          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.45 }}>
            {step + 1} из {STEPS.length}
          </span>
          <button className="chip chip-sm" onClick={onClose}>
            Пропустить
          </button>
        </div>

        <div style={{ padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {current.figure}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span className="num" style={{ fontSize: 24 }}>
              {current.title}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.55, opacity: 0.8 }}>
              {current.text}
            </span>
          </div>

          {/* Полоски шагов: по ним же можно вернуться, если захотелось перечитать. */}
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((item, index) => (
              <button
                key={item.title}
                onClick={() => go(index)}
                aria-label={`Шаг ${index + 1}: ${item.title}`}
                style={{
                  flexGrow: 1,
                  height: 4,
                  borderRadius: 2,
                  padding: 0,
                  background: index <= step ? 'var(--amber)' : 'rgba(242,234,219,.18)',
                }}
              />
            ))}
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button
              className="btn btn-ghost"
              style={{ height: 44, padding: '0 20px' }}
              onClick={() => (step === 0 ? onClose() : go(step - 1))}
            >
              {step === 0 ? 'Закрыть' : 'Назад'}
            </button>
            <div className="grow" />
            <button
              className="btn btn-primary"
              style={{ height: 44, padding: '0 28px' }}
              onClick={() => (last ? onClose() : go(step + 1))}
            >
              {last ? 'Понятно' : 'Дальше'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
