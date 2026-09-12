import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AdminReport } from '../api/types'
import { useGame } from '../store/gameStore'
import { fmtInt, fmtMult } from '../utils/format'

/**
 * Отчётность администратора продукта.
 *
 * Экран отвечает на два вопроса и больше ни на какие: сколько игра заработала
 * и что происходило в последних раундах. Прежняя версия показывала ещё
 * распределение точки краха, окупаемость бустеров по тирам, разбивку по темам
 * и таблицу игроков — на четырёх демо-аккаунтах все эти срезы состояли из
 * единиц наблюдений и читались как шум.
 *
 * Кодировка данных сознательно не опирается на цвет. Пара «зелёный/бордовый»,
 * которой в игре различаются темы, при дейтеранопии даёт разницу ΔE 5.7 — то
 * есть по цвету не читалась бы вовсе. Поэтому тема названа словом, прибыль
 * подписана знаком, а доли показаны одним акцентным цветом на нейтральной
 * дорожке.
 */
export function ReportScreen() {
  const goToTheme = useGame((s) => s.goToTheme)

  const [report, setReport] = useState<AdminReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

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

  /*
    Выгрузка идёт через blob, а не через <a href="/api/admin/rounds.csv">:
    прямая ссылка на отказ сервера увела бы администратора со страницы на
    голый JSON с ошибкой, а так он остаётся на экране и видит сообщение.
  */
  const exportCsv = useCallback(async () => {
    setExporting(true)
    try {
      const blob = await api.roundsCsv()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'balloon-rounds.csv'
      link.click()
      URL.revokeObjectURL(url)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExporting(false)
    }
  }, [])

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

            <div className="report-cols report-cols-even">
              <CashFlow report={report} />
              <RecentFlights report={report} onExport={() => void exportCsv()} exporting={exporting} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpis({ report }: { report: AdminReport }) {
  const t = report.totals
  const profit = t.houseNet >= 0

  return (
    <div className="report-kpis">
      <div className="panel stat-tile" style={{ borderColor: 'rgba(242,166,73,.44)' }}>
        <span className="num" style={{ fontSize: 34, color: 'var(--amber)' }}>
          {signed(t.houseNet)}
        </span>
        <span className="stat-caption">заработала игра</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: profit ? 'var(--emerald-lt)' : 'var(--bordeaux-lt)' }}>
          {profit ? 'в плюсе' : 'в минусе'} · приняли {fmtInt(t.accepted)}, отдали {fmtInt(t.paidOut)}
        </span>
      </div>

      <Tile value={pct(t.rtp)} caption="возврат игроку" hint="на каждые 100 принятых баллов" />

      <Tile
        value={fmtInt(t.flights)}
        caption="полётов"
        hint={`из них со ставками ${fmtInt(t.flightsWithBets)}`}
      />

      <Tile
        value={fmtInt(t.players)}
        caption="игроков"
        hint={`делали ставки ${fmtInt(t.playersWithBets)}`}
      />
    </div>
  )
}

function Tile({ value, caption, hint }: { value: string; caption: string; hint: string }) {
  return (
    <div className="panel stat-tile">
      <span className="num" style={{ fontSize: 34 }}>
        {value}
      </span>
      <span className="stat-caption">{caption}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.5 }}>{hint}</span>
    </div>
  )
}

/**
 * Куда пришли и куда ушли деньги.
 *
 * Все три полосы меряются одной линейкой — принятой суммой, — поэтому их длины
 * сравнимы между собой: видно и то, какую долю прихода дала доплата за бустер,
 * и то, насколько выплата не дотянула до прихода.
 */
function CashFlow({ report }: { report: AdminReport }) {
  const t = report.totals
  const scale = Math.max(t.accepted, t.paidOut, 1)
  const profit = t.houseNet >= 0

  return (
    <div className="panel report-card">
      <span className="label">Приход и расход</span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Bar label="Ставки игроков" value={t.staked} share={t.staked / scale} color="var(--amber)" />
        <Bar label="Доплата за бустеры" value={t.boostFees} share={t.boostFees / scale} color="#8a7fc4" />
        <div className="hr" />
        <Bar label="Выплачено выигрышей" value={t.paidOut} share={t.paidOut / scale} color="var(--emerald-lt)" />
      </div>

      <div className="grow" />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '18px 22px',
          background: 'var(--amber-dim)',
          border: '1px solid rgba(242,166,73,.42)',
          borderRadius: 3,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="label">Осталось игре</span>
          <span className="num" style={{ fontWeight: 800, fontSize: 40, lineHeight: 1, color: 'var(--amber)' }}>
            {signed(t.houseNet)}
          </span>
        </div>
        <div className="grow" />
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6, lineHeight: 1.5, maxWidth: 280 }}>
          {profit
            ? `Приняли ${fmtInt(t.accepted)}, отдали ${fmtInt(t.paidOut)}. Доплата за бустер сгорает всегда и в выплате не участвует.`
            : `Приняли ${fmtInt(t.accepted)}, отдали ${fmtInt(t.paidOut)}. Игра сейчас в убытке — выплаты обогнали приход.`}
        </span>
      </div>
    </div>
  )
}

function Bar({
  label,
  value,
  share,
  color,
}: {
  label: string
  value: number
  share: number
  color: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
        <div className="grow" />
        <span className="num" style={{ fontSize: 22 }}>
          {fmtInt(value)}
        </span>
      </div>
      <div className="report-track" style={{ height: 26 }}>
        <div
          className="report-track-fill"
          style={{ width: `${Math.min(100, share * 100)}%`, background: color }}
        />
      </div>
    </div>
  )
}

/**
 * Последние полёты — по одной строке на раунд, а не на ставку.
 *
 * Раунды без участников остаются в списке: цикл идёт непрерывно, и, пропусти
 * мы их, он выглядел бы прерывистым, а «полётов 128» в шапке не сходилось бы
 * с тем, что видно в таблице.
 */
function RecentFlights({
  report,
  onExport,
  exporting,
}: {
  report: AdminReport
  onExport: () => void
  exporting: boolean
}) {
  return (
    <div className="panel report-card">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="label">Последние раунды</span>
        <div className="grow" />
        <span style={{ fontSize: 10.5, opacity: 0.45 }}>полностью — в выгрузке</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Раунд</th>
              <th>Тема</th>
              <th>Крах</th>
              <th>Ставок</th>
              <th>Принято</th>
              <th>Выплачено</th>
            </tr>
          </thead>
          <tbody>
            {report.recent.map((flight) => (
              <tr key={flight.roundId}>
                <td style={{ opacity: 0.5 }}>{flight.roundId}</td>
                <td>{flight.theme === 'green' ? 'Изумруд' : 'Бордо'}</td>
                <td
                  className="num"
                  style={{ color: flight.crashAt < 1.5 ? 'var(--bordeaux-lt)' : 'var(--cream)' }}
                >
                  {fmtMult(flight.crashAt)}
                </td>
                <td>{flight.betCount > 0 ? flight.betCount : <span style={{ opacity: 0.35 }}>—</span>}</td>
                <td>{flight.betCount > 0 ? fmtInt(flight.accepted) : <span style={{ opacity: 0.35 }}>—</span>}</td>
                <td>{flight.betCount > 0 ? fmtInt(flight.paidOut) : <span style={{ opacity: 0.35 }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.recent.length === 0 && (
        <span style={{ fontSize: 12, opacity: 0.5 }}>Ни одного завершённого раунда пока нет.</span>
      )}

      <div className="grow" />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '15px 18px',
          background: 'var(--amber-dim)',
          border: '1px solid rgba(242,166,73,.42)',
          borderRadius: 3,
          flexWrap: 'wrap',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="M7.5 10.5L12 15l4.5-4.5" />
          <path d="M4 19h16" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>Скачать журнал раундов</span>
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.55 }}>
            CSV: раунд, время, тема, крах, ставок, принято, выплачено, прибыль
          </span>
        </div>
        <div className="grow" />
        <button
          className="btn btn-primary"
          style={{ height: 44, padding: '0 26px', fontSize: 12 }}
          onClick={onExport}
          disabled={exporting}
        >
          {exporting ? 'Готовлю…' : 'Выгрузить'}
        </button>
      </div>
    </div>
  )
}

/** Прибыль без знака читается как оборот, поэтому плюс пишем явно. */
function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${fmtInt(value)}`
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1).replace('.', ',')} %`
}
