import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AdminReport } from '../api/types'
import { useGame } from '../store/gameStore'
import { fmtInt, fmtMult } from '../utils/format'

/**
 * Отчётность администратора продукта.
 *
 * Кодировка данных сознательно не опирается на цвет. Пара «зелёный/бордовый»,
 * которой в игре различаются темы, при дейтеранопии даёт разницу ΔE 5.7 — то
 * есть исход раунда по цвету не читался бы вовсе. Поэтому исход всегда написан
 * словом, доли показаны одним акцентным цветом на нейтральной дорожке, а в
 * гистограмме значение несёт высота столбца, а не оттенок.
 */
export function ReportScreen() {
  const goToTheme = useGame((s) => s.goToTheme)

  const [report, setReport] = useState<AdminReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      setReport(await api.adminReport())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="screen report-screen">
      <div className="screen-inner">
        <div className="topbar">
          <span className="num" style={{ fontSize: 26 }}>
            Отчётность
          </span>
          <span className="label">Воздушный шар · администратор</span>
          <div className="grow" />
          {report && (
            <span style={{ fontSize: 11, opacity: 0.45 }}>
              снято {new Date(report.generatedAt).toLocaleTimeString('ru-RU')}
            </span>
          )}
          <button className="chip" onClick={() => void load()} disabled={busy}>
            {busy ? 'Обновляю…' : 'Обновить'}
          </button>
          <button className="chip chip-amber" onClick={goToTheme}>
            К игре
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {!report && !error && <span className="label">Собираю данные…</span>}

        {report && (
          <div className="report-body scroll-y">
            <Kpis report={report} />

            <div className="report-cols">
              <CrashDistribution report={report} />
              <ModelSummary report={report} />
            </div>

            <BoostTable report={report} />
            <ThemeTable report={report} />
            <PlayerTable report={report} />
            <RecentTable report={report} />
          </div>
        )}
      </div>
    </div>
  )
}

function Kpis({ report }: { report: AdminReport }) {
  const t = report.totals
  return (
    <div className="report-kpis">
      <Tile value={fmtInt(t.rounds)} caption="раундов сыграно" />
      <Tile value={fmtInt(t.players)} caption="аккаунтов" />
      <Tile value={fmtInt(t.totalPaid)} caption="принято ставок" hint="ставки и доплаты за бустер" />
      <Tile value={fmtInt(t.paidOut)} caption="выплачено" />
      <Tile
        value={pct(t.rtp)}
        caption="возврат игроку"
        accent
        hint="выплачено ÷ принято; доплата за бустер сгорает всегда"
      />
      <Tile
        value={`${t.houseNet >= 0 ? '+' : ''}${fmtInt(t.houseNet)}`}
        caption="осталось у игры"
        hint="принято минус выплачено"
      />
    </div>
  )
}

function Tile({
  value,
  caption,
  accent,
  hint,
}: {
  value: string
  caption: string
  accent?: boolean
  hint?: string
}) {
  return (
    <div className="panel stat-tile" title={hint}>
      <span className="num" style={{ fontSize: 30, color: accent ? 'var(--amber)' : 'var(--cream)' }}>
        {value}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.52, lineHeight: 1.35 }}>{caption}</span>
    </div>
  )
}

/**
 * Где чаще всего лопается шар. Значение несёт высота столбца; акцентом выделен
 * только самый частый диапазон, и он же подписан — это эмфаза внутри одного
 * ряда, а не вторая категория.
 */
function CrashDistribution({ report }: { report: AdminReport }) {
  const buckets = report.crashDistribution
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1)
  const peak = buckets.reduce((best, bucket) => (bucket.count > best.count ? bucket : best), buckets[0])

  return (
    <div className="panel report-card">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="label">Где лопается шар</span>
        <div className="grow" />
        <span style={{ fontSize: 10.5, opacity: 0.45 }}>раундов в диапазоне коэффициента</span>
      </div>

      <div className="report-bars">
        {buckets.map((bucket) => {
          const isPeak = peak && bucket.from === peak.from && bucket.count > 0
          return (
            <div key={bucket.from} className="report-bar-col">
              <span
                className="num"
                style={{
                  fontSize: 12,
                  color: isPeak ? 'var(--amber)' : 'rgba(242,234,219,.5)',
                }}
              >
                {bucket.count}
              </span>
              <div
                title={`${bucketLabel(bucket)} — ${bucket.count} раундов, ${pct(bucket.share)}`}
                style={{
                  width: '100%',
                  height: `${Math.max(bucket.count > 0 ? 6 : 2, (bucket.count / max) * 100)}%`,
                  background: isPeak ? 'var(--amber)' : '#8a7fc4',
                  borderRadius: '3px 3px 0 0',
                }}
              />
              <span style={{ fontSize: 9.5, opacity: 0.5, whiteSpace: 'nowrap' }}>
                {bucketLabel(bucket)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ModelSummary({ report }: { report: AdminReport }) {
  const t = report.totals
  return (
    <div className="panel report-card">
      <span className="label">Как ведёт себя модель</span>

      <div className="report-stats-row">
        <Mini value={fmtMult(t.medianCrash)} caption="медианный крах" />
        <Mini value={fmtMult(t.meanCrash)} caption="средний крах" />
        <Mini value={fmtMult(t.maxCrash)} caption="максимум" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div className="row" style={{ gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Раунды с выводом</span>
          <div className="grow" />
          <span className="num" style={{ fontSize: 18, color: 'var(--amber)' }}>
            {pct(t.cashoutShare)}
          </span>
        </div>

        {/* Одна доля — одна заливка на нейтральной дорожке, без второй категории. */}
        <div className="report-track">
          <div className="report-track-fill" style={{ width: `${t.cashoutShare * 100}%` }} />
        </div>

        <span style={{ fontSize: 11, opacity: 0.5, lineHeight: 1.45 }}>
          Забрали выигрыш в {fmtInt(t.cashoutRounds)} раундах, не успели — в {fmtInt(t.crashRounds)}.
          Начислено {fmtInt(t.pointsAwarded)} турнирных очков.
        </span>
      </div>
    </div>
  )
}

function Mini({ value, caption }: { value: string; caption: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="num" style={{ fontSize: 21 }}>
        {value}
      </span>
      <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.5 }}>{caption}</span>
    </div>
  )
}

function BoostTable({ report }: { report: AdminReport }) {
  return (
    <div className="panel report-card">
      <span className="label">Бустеры: покупают и срабатывают</span>
      <table className="report-table">
        <thead>
          <tr>
            <th>Бустер</th>
            <th className="num-col">Раундов</th>
            <th className="num-col">Сработал</th>
            <th className="num-col">Доля</th>
            <th className="num-col">Доплат собрано</th>
            <th className="num-col">Выплачено</th>
          </tr>
        </thead>
        <tbody>
          {report.boostTiers.map((tier) => (
            <tr key={tier.tier}>
              <td>{tier.tier === 1 ? 'без бустера' : `×${tier.tier}`}</td>
              <td className="num-col">{fmtInt(tier.rounds)}</td>
              <td className="num-col">{tier.tier === 1 ? '—' : fmtInt(tier.applied)}</td>
              <td className="num-col">{tier.tier === 1 ? '—' : pct(tier.appliedShare)}</td>
              <td className="num-col">{fmtInt(tier.feesPaid)}</td>
              <td className="num-col">{fmtInt(tier.wonWith)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ThemeTable({ report }: { report: AdminReport }) {
  return (
    <div className="panel report-card">
      <span className="label">Темы</span>
      <table className="report-table">
        <thead>
          <tr>
            <th>Тема</th>
            <th className="num-col">Раундов</th>
            <th className="num-col">Принято</th>
            <th className="num-col">Выплачено</th>
            <th className="num-col">Возврат</th>
          </tr>
        </thead>
        <tbody>
          {report.themes.map((theme) => (
            <tr key={theme.theme}>
              <td>{theme.theme === 'green' ? 'Изумруд · 9 уровней' : 'Бордо · 12 уровней'}</td>
              <td className="num-col">{fmtInt(theme.rounds)}</td>
              <td className="num-col">{fmtInt(theme.totalPaid)}</td>
              <td className="num-col">{fmtInt(theme.paidOut)}</td>
              <td className="num-col">{pct(theme.rtp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayerTable({ report }: { report: AdminReport }) {
  return (
    <div className="panel report-card">
      <span className="label">Игроки</span>
      <table className="report-table">
        <thead>
          <tr>
            <th>Игрок</th>
            <th>Роль</th>
            <th className="num-col">Баланс</th>
            <th className="num-col">Очки</th>
            <th className="num-col">Раундов</th>
            <th className="num-col">Потрачено</th>
            <th className="num-col">Выиграно</th>
            <th className="num-col">Итог</th>
            <th className="num-col">Лучший вывод</th>
          </tr>
        </thead>
        <tbody>
          {report.players.map((player) => (
            <tr key={player.id}>
              <td>
                {player.displayName}
                <span style={{ opacity: 0.4 }}> · {player.username}</span>
              </td>
              <td>{player.role === 'ADMIN' ? 'админ' : 'игрок'}</td>
              <td className="num-col">{fmtInt(player.balance)}</td>
              <td className="num-col">{fmtInt(player.totalPoints)}</td>
              <td className="num-col">{fmtInt(player.rounds)}</td>
              <td className="num-col">{fmtInt(player.totalPaid)}</td>
              <td className="num-col">{fmtInt(player.paidOut)}</td>
              <td className="num-col" style={{ color: player.net >= 0 ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)' }}>
                {player.net >= 0 ? '+' : ''}
                {fmtInt(player.net)}
              </td>
              <td className="num-col">{player.bestMultiplier ? fmtMult(player.bestMultiplier) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RecentTable({ report }: { report: AdminReport }) {
  return (
    <div className="panel report-card">
      <span className="label">Последние раунды</span>
      <table className="report-table">
        <thead>
          <tr>
            <th>Время</th>
            <th>Игрок</th>
            <th>Тема</th>
            <th className="num-col">Ставка</th>
            <th>Исход</th>
            <th className="num-col">Коэффициент</th>
            <th className="num-col">Выигрыш</th>
            <th className="num-col">Очки</th>
            <th>Бустер</th>
          </tr>
        </thead>
        <tbody>
          {report.recent.map((round) => (
            <tr key={round.roundId}>
              <td style={{ opacity: 0.55 }}>
                {new Date(round.finishedAt).toLocaleTimeString('ru-RU')}
              </td>
              <td>{round.player}</td>
              <td>{round.theme === 'green' ? 'изумруд' : 'бордо'}</td>
              <td className="num-col">{fmtInt(round.stake)}</td>
              {/* Исход написан словом: цвет здесь только подкрепляет текст. */}
              <td
                style={{
                  color: round.outcome === 'cashout' ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)',
                  fontWeight: 700,
                }}
              >
                {round.outcome === 'cashout' ? 'забрал' : 'крах'}
              </td>
              <td className="num-col">{fmtMult(round.multiplier)}</td>
              <td className="num-col">{round.winAmount ? fmtInt(round.winAmount) : '—'}</td>
              <td className="num-col">{fmtInt(round.points)}</td>
              <td>
                {round.boostTier === 1 ? '—' : `×${round.boostTier} ${round.boostApplied ? 'сработал' : 'не успел'}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.recent.length === 0 && (
        <span style={{ fontSize: 12, opacity: 0.5 }}>Раундов пока нет — сыграйте, и таблица наполнится.</span>
      )}
    </div>
  )
}

const pct = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')} %`

const bucketLabel = (bucket: AdminReport['crashDistribution'][number]) =>
  bucket.to === null ? `${bucket.from}+` : `${bucket.from}–${bucket.to}`
