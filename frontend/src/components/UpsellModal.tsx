import { useEffect, useRef, useState } from 'react'
import { PuzzleIcon } from './PuzzleIcon'
import type { BoostOption } from '../api/types'
import { fmtInt } from '../utils/format'

/**
 * Апсейл «Закрепи успех» — сценарий 8 ТЗ. После крупного выигрыша предлагаем
 * не уносить бонусы, а сразу вложить часть в фрагмент с бустером.
 *
 * Три условия ТЗ распределены так: порог `upsell.min_win_amount` и «не чаще
 * раза за сессию» решает вызывающий экран (у него есть и результат, и флаг
 * сессии), а автозакрытие через `upsell.popup_timeout_sec` — здесь.
 *
 * Отсчёт ведём в JS, а не CSS-анимацией: глобальное правило
 * prefers-reduced-motion схлопывает анимации до 0.01ms, и полоса пропала бы
 * мгновенно, хотя окно ещё живёт свои 10 секунд.
 */
export function UpsellModal({
  winAmount,
  option,
  stake,
  balance,
  timeoutSec,
  onAccept,
  onClose,
}: {
  winAmount: number
  /** Что предлагаем: бустер, доплату за который игрок может себе позволить. */
  option: BoostOption
  stake: number
  balance: number
  timeoutSec: number
  onAccept: () => void
  onClose: () => void
}) {
  const totalMs = Math.max(1, timeoutSec) * 1000
  const [leftMs, setLeftMs] = useState(totalMs)

  // Замыкание в setInterval видит onClose первого рендера, поэтому держим
  // ссылку в ref — иначе автозакрытие дёрнет устаревший обработчик.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const startedAt = performance.now()
    const timer = setInterval(() => {
      const left = totalMs - (performance.now() - startedAt)
      if (left <= 0) {
        clearInterval(timer)
        setLeftMs(0)
        closeRef.current()
        return
      }
      setLeftMs(left)
    }, 100)
    return () => clearInterval(timer)
  }, [totalMs])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const boost = option.boostMultiplier
  const fee = Math.ceil(stake * option.priceFactor)
  const rest = balance - stake - fee

  return (
    <div className="modal-backdrop" style={{ zIndex: 40 }} onClick={onClose}>
      <div
        className="modal"
        style={{ width: 'min(520px, 100%)', animation: 'fadeIn .3s ease' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '18px 24px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span
            style={{
              padding: '6px 13px',
              background: 'var(--amber)',
              borderRadius: 2,
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              color: 'var(--ink-soft)',
            }}
          >
            Предложение
          </span>
          <span className="num" style={{ fontSize: 22 }}>
            Закрепи успех
          </span>
        </div>

        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span className="label">Только что выиграно</span>
            <span className="num" style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: 'var(--amber)' }}>
              {fmtInt(winAmount)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.7, lineHeight: 1.5 }}>
              Бонусы уже на балансе. Докупите бустер к той же ставке — если дотянете до
              его уровня, коэффициент умножится на {boost}.
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '16px 18px',
              background: 'var(--amber-dim)',
              border: '1px solid rgba(242,166,73,.42)',
              borderRadius: 3,
            }}
          >
            <PuzzleIcon filled size={34} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="num" style={{ fontSize: 21 }}>
                Фрагмент ×{boost}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.65 }}>
                бустер ждёт на случайном уровне
              </span>
            </div>
            <div className="grow" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <span className="num" style={{ fontSize: 21 }}>
                {fmtInt(stake)} + {fmtInt(fee)}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.65 }}>
                ставка и бустер · останется {fmtInt(rest)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              style={{ flex: '1 1 220px', height: 56 }}
              onClick={onAccept}
            >
              Взлетаем с ×{boost}
            </button>
            <button className="btn btn-ghost" style={{ flex: '1 1 130px', height: 56 }} onClick={onClose}>
              Не сейчас
            </button>
          </div>
        </div>

        {/* Полоса и число: сколько предложение ещё на экране. */}
        <div style={{ padding: '0 24px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flexGrow: 1, height: 3, background: 'rgba(242,234,219,.12)' }}>
            <div
              style={{
                width: `${(leftMs / totalMs) * 100}%`,
                height: '100%',
                background: 'var(--amber)',
                opacity: 0.75,
              }}
            />
          </div>
          <span className="num" style={{ fontSize: 12, opacity: 0.55 }}>
            {Math.ceil(leftMs / 1000)} с
          </span>
        </div>
      </div>
    </div>
  )
}
