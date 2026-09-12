import { useGame } from '../store/gameStore'

/**
 * Кто играет: имя, роль и выход из аккаунта.
 *
 * Стоит в шапке экрана, а не фиксированным углом поверх всего: у каждого
 * экрана в левой части шапки свой элемент — кнопка «Тема» на ставках, плашка
 * темы в полёте, — и оверлей перекрывал бы их на узких экранах.
 *
 * Роль показана всегда, а не только администратору: под `player1` и под
 * `admin` экраны отличаются набором кнопок, и на защите нужно с одного взгляда
 * понимать, из-под кого сейчас смотрят.
 */
export function AccountChip() {
  const user = useGame((s) => s.user)
  const logout = useGame((s) => s.logout)

  if (!user) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="chip chip-sm" title={`Вы вошли как ${user.username}`}>
        <span style={{ color: 'var(--amber)' }}>{user.displayName}</span>
        <span style={{ opacity: 0.5 }}>{user.role === 'ADMIN' ? 'админ' : 'игрок'}</span>
      </span>

      <button
        className="chip chip-sm"
        onClick={() => void logout()}
        title="Выйти из аккаунта"
        aria-label="Выйти из аккаунта"
        style={{ padding: '5px 8px' }}
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12.5 6.5V4.2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v11.6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V13.5" strokeLinecap="round" />
          <path d="M8.5 10h8m0 0-2.4-2.4M16.5 10l-2.4 2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
