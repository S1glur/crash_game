import { useState } from 'react'
import { Balloon } from '../components/Balloon'
import { Scene } from '../components/Scene'
import { useGame } from '../store/gameStore'

/**
 * Демо-доступы прямо на экране входа.
 *
 * ТЗ требует, чтобы эксперт прошёл все сценарии без обращения к команде, а
 * гостевого режима у нас нет — значит логины должны быть на виду, а не только
 * в README, который во время защиты никто не открывает.
 *
 * Список дублирует config/accounts.json: меняете там — поправьте и здесь.
 */
const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'admin123', note: 'админ · настройки игры' },
  { username: 'vip', password: 'vip12345', note: 'игрок · крупный баланс' },
  { username: 'player1', password: 'player123', note: 'игрок' },
  { username: 'player2', password: 'player123', note: 'игрок' },
]

type Mode = 'login' | 'register'

export function AuthScreen() {
  const login = useGame((s) => s.login)
  const register = useGame((s) => s.register)

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login(username, password)
      } else {
        await register(username, password, displayName)
      }
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  const fill = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setMode('login')
    setError(null)
    setUsername(account.username)
    setPassword(account.password)
  }

  return (
    <div className="screen">
      <Scene theme="red" />

      <div className="screen-inner" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="auth-wrap scroll-y">
          <div className="auth-head">
            <Balloon theme="red" width={78} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h1
                className="num"
                style={{
                  margin: 0,
                  fontSize: 'clamp(28px, 4vw, 44px)',
                  lineHeight: 1,
                  letterSpacing: '-.02em',
                  textShadow: '0 6px 40px rgba(10,8,24,.7)',
                }}
              >
                Воздушный шар
              </h1>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '.24em',
                  textTransform: 'uppercase',
                  color: 'var(--amber)',
                }}
              >
                Выше риск — больше награда
              </span>
            </div>
          </div>

          <form className="panel auth-card" onSubmit={submit}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost grow"
                onClick={() => switchMode('login')}
                style={mode === 'login' ? activeTab : undefined}
              >
                Вход
              </button>
              <button
                type="button"
                className="btn btn-ghost grow"
                onClick={() => switchMode('register')}
                style={mode === 'register' ? activeTab : undefined}
              >
                Регистрация
              </button>
            </div>

            <label className="auth-label">
              <span className="label">Логин</span>
              <input
                className="field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="player1"
                required
              />
            </label>

            {mode === 'register' && (
              <label className="auth-label">
                <span className="label">Имя в таблице участников</span>
                <input
                  className="field"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                  placeholder="Как вас показывать другим"
                />
              </label>
            )}

            <label className="auth-label">
              <span className="label">Пароль</span>
              <input
                className="field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? 'не короче 6 символов' : '••••••'}
                required
              />
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button className="btn btn-primary" type="submit" disabled={busy} style={{ padding: '15px 0' }}>
              {busy ? 'Минуту…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </button>

            {mode === 'register' && (
              <span style={{ fontSize: 11.5, opacity: 0.55, lineHeight: 1.5 }}>
                Логин — латиница, цифры, дефис или подчёркивание, от 3 до 20 символов.
                Новый аккаунт получает стартовый баланс бонусных баллов.
              </span>
            )}
          </form>

          <div className="panel auth-demo">
            <span className="label" style={{ color: 'var(--amber)' }}>
              Демо-доступы
            </span>
            <span style={{ fontSize: 11.5, opacity: 0.6, lineHeight: 1.5 }}>
              Нажмите на строку — логин и пароль подставятся в форму.
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  className="auth-demo-row"
                  onClick={() => fill(account)}
                >
                  <span className="num" style={{ fontSize: 16 }}>
                    {account.username}
                  </span>
                  <span style={{ fontSize: 11.5, opacity: 0.5 }}>{account.password}</span>
                  <div className="grow" />
                  <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.45 }}>{account.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const activeTab: React.CSSProperties = {
  borderColor: 'var(--amber)',
  color: 'var(--amber)',
  background: 'var(--amber-dim)',
}
