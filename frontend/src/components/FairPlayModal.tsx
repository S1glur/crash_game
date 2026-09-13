import { useMemo, useState } from 'react'
import type { RecentRound } from '../api/types'
import { useGame } from '../store/gameStore'
import { fmtMult } from '../utils/format'

/**
 * Честная игра: как убедиться, что исход раунда не подменили.
 *
 * Раньше отпечаток раунда был виден только в полёте, обрезанный до шестнадцати
 * символов и без единого слова о том, что с ним делать. Такой «provably fair»
 * ничего не доказывает: проверить его игрок не мог, а верить на слово — ровно
 * то, от чего схема и должна избавлять.
 *
 * Здесь показана вся цепочка: строка раунда, опубликованный до взлёта
 * отпечаток и пересчёт SHA-256 прямо на странице. Плюс готовая команда, чтобы
 * посчитать то же самое вне игры — доверять нашей же кнопке необязательно.
 */
export function FairPlayModal({ onClose }: { onClose: () => void }) {
  const theme = useGame((s) => s.theme)
  const round = useGame((s) => s.round)
  const recentRounds = useGame((s) => s.recentRounds)

  const flights = useMemo(
    () => recentRounds.filter((flight) => flight.theme === theme).slice(0, 8),
    [recentRounds, theme],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected: RecentRound | null =
    flights.find((flight) => flight.roundId === selectedId) ?? flights[0] ?? null

  const [computed, setComputed] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  /*
    Строка раунда собирается ровно так же, как на сервере: точка краха с шестью
    знаками после точки, индекс уровня с бустером (−1, если бустера не было) и
    seed, разделённые вертикальной чертой. Любое расхождение в формате даст
    другой отпечаток, поэтому crashPointRaw приходит с сервера уже строкой, а
    не числом, — иначе форматирование зависело бы от браузера.
  */
  const payload = selected
    ? `${selected.crashPointRaw}|${selected.boostLevelIndex}|${selected.serverSeed}`
    : ''

  const matched = computed !== null && selected !== null && computed === selected.resultHash

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  const verify = async () => {
    if (!selected) return
    setChecking(true)
    setComputed(await sha256Hex(payload))
    setChecking(false)
  }

  const select = (roundId: string) => {
    setSelectedId(roundId)
    setComputed(null)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(event) => event.stopPropagation()}
        style={{ padding: '24px 26px', overflowY: 'auto', gap: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="head" style={{ fontSize: 28 }}>
            Честная игра
          </span>
          <div className="grow" />
          <button className="chip chip-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.7, lineHeight: 1.55 }}>
          Исход раунда решается до взлёта, и это можно проверить самому — ниже вся цепочка.
        </span>

        <ol
          style={{
            margin: 0,
            paddingLeft: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1.55,
            opacity: 0.82,
          }}
        >
          <li>
            До взлёта сервер выбирает точку краха, уровень с бустером и секретное число
            (seed), склеивает их в одну строку и публикует её отпечаток — SHA-256.
            Отпечаток виден во время полёта, сама строка закрыта.
          </li>
          <li>
            Подменить исход после этого нельзя: изменится хоть один знак — отпечаток
            станет другим, а опубликован он уже был.
          </li>
          <li>
            После краха сервер раскрывает строку целиком. Считаете её SHA-256 и
            сравниваете с тем, что было опубликовано до взлёта.
          </li>
        </ol>

        <div className="hr" />

        {round && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="label">Отпечаток текущего раунда</span>
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.5 }}>
                {round.roundId} · seed раскроется после краха
              </span>
            </div>
            <Mono text={round.resultHash} onCopy={() => copy(round.resultHash, 'hash-now')} />
          </div>
        )}

        <div className="hr" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="label">Проверить завершённый раунд</span>

          {flights.length === 0 ? (
            <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.55 }}>
              В этой теме ещё не было завершённых полётов — проверять пока нечего.
            </span>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {flights.map((flight) => (
                  <button
                    key={flight.roundId}
                    className="chip chip-sm"
                    onClick={() => select(flight.roundId)}
                    aria-pressed={selected?.roundId === flight.roundId}
                    style={
                      selected?.roundId === flight.roundId
                        ? { background: 'var(--amber)', color: 'var(--ink-soft)' }
                        : undefined
                    }
                  >
                    {flight.roundId} · {fmtMult(flight.crashAt)}×
                  </button>
                ))}
              </div>

              {selected && (
                <>
                  <Field
                    label="Строка раунда"
                    hint="точка краха · уровень бустера (−1 — бустера не было) · seed"
                    text={payload}
                    onCopy={() => copy(payload, 'payload')}
                  />

                  <Field
                    label="Отпечаток, опубликованный до взлёта"
                    text={selected.resultHash}
                    onCopy={() => copy(selected.resultHash, 'hash')}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-primary"
                      style={{ height: 44, padding: '0 20px', fontSize: 12 }}
                      onClick={() => void verify()}
                      disabled={checking}
                    >
                      {checking ? 'Считаем…' : 'Посчитать SHA-256'}
                    </button>

                    {computed && (
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 800,
                          color: matched ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)',
                        }}
                      >
                        {matched
                          ? 'Совпало — исход был известен до взлёта'
                          : 'Не совпало — сообщите организаторам'}
                      </span>
                    )}
                  </div>

                  {computed && (
                    <Field label="Посчитано сейчас" text={computed} onCopy={() => copy(computed, 'computed')} />
                  )}

                  <div className="hr" />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span className="label">Посчитать вне игры</span>
                      <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.5 }}>
                        чтобы не верить и нашей кнопке
                      </span>
                    </div>

                    <Field
                      label="PowerShell"
                      text={powershell(payload)}
                      onCopy={() => copy(powershell(payload), 'ps')}
                    />
                    <Field
                      label="Node.js"
                      text={node(payload)}
                      onCopy={() => copy(node(payload), 'node')}
                    />
                    <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.55, lineHeight: 1.5 }}>
                      Подойдёт и любой онлайн-калькулятор SHA-256: вставьте строку раунда без
                      кавычек и пробелов по краям.
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {copied && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--amber)' }}>
            Скопировано в буфер обмена
          </span>
        )}
      </div>
    </div>
  )
}

/** SHA-256 прямо в браузере: тот же алгоритм, что считает сервер. */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function powershell(payload: string): string {
  return `[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes('${payload}'))).Replace('-','').ToLower()`
}

function node(payload: string): string {
  return `node -e "console.log(require('crypto').createHash('sha256').update('${payload}').digest('hex'))"`
}

/** Моноширинная строка, которую можно забрать одним кликом. */
function Mono({ text, onCopy }: { text: string; onCopy: () => void }) {
  return (
    <button
      onClick={onCopy}
      title="Нажмите, чтобы скопировать"
      style={{
        padding: '11px 14px',
        background: 'var(--surface-2)',
        borderRadius: 'var(--r-sm)',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        fontSize: 11.5,
        lineHeight: 1.6,
        color: 'var(--cream)',
        textAlign: 'left',
        wordBreak: 'break-all',
      }}
    >
      {text}
    </button>
  )
}

function Field({
  label,
  hint,
  text,
  onCopy,
}: {
  label: string
  hint?: string
  text: string
  onCopy: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.75 }}>{label}</span>
        {hint && <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.45 }}>{hint}</span>}
      </div>
      <Mono text={text} onCopy={onCopy} />
    </div>
  )
}
