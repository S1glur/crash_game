import {
  ApiError,
  type AdminReport,
  type CashoutResult,
  type GameConfig,
  type GameState,
  type HistoryItem,
  type LeaderRow,
  type RoundResult,
  type StartedRound,
  type Theme,
  type User,
} from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    // Сессия живёт в куке: без этого браузер не приложит её к запросу,
    // и каждый вызов приходил бы на сервер анонимным.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  // Тело может быть пустым или не-JSON (например, страница ошибки прокси),
  // а падать с SyntaxError вместо понятного сообщения незачем.
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      body?.error ?? 'UNKNOWN',
      body?.message ?? 'Ошибка запроса',
      response.status,
    )
  }
  return body as T
}

export const api = {
  state: () => request<GameState>('/api/state'),

  config: () => request<GameConfig>('/api/config'),

  /** Сохранение настроек из админки. Доступно только роли ADMIN. */
  saveConfig: (config: unknown) =>
    request<GameConfig>('/api/config', { method: 'PUT', body: JSON.stringify(config, null, 2) }),

  rules: () => request<{ content: string }>('/api/rules'),

  /** Пополнение баланса до стартового — чтобы проигрыш не запирал игру. */
  topUp: () => request<{ credited: number; balance: number }>('/api/demo/topup', { method: 'POST' }),

  history: (limit = 20) => request<{ items: HistoryItem[] }>(`/api/history?limit=${limit}`),

  /** Первый снимок таблицы; дальше она приходит сама по /topic/leaderboard. */
  leaderboard: () => request<{ rows: LeaderRow[] }>('/api/leaderboard'),

  /** Отчётность администратора. Игроку сервер ответит 403. */
  adminReport: () => request<AdminReport>('/api/admin/report'),

  register: (username: string, password: string, displayName: string) =>
    request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName }),
    }),

  login: (username: string, password: string) =>
    request<User>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<User>('/api/auth/me'),

  startRound: (
    theme: Theme,
    stake: number,
    boostOptionId: string,
    options?: { autoCashoutAt?: number | null; seed?: number; speedFactor?: number },
  ) =>
    request<StartedRound>('/api/round/start', {
      method: 'POST',
      body: JSON.stringify({ theme, stake, boostOptionId, ...options }),
    }),

  cashout: (roundId: string) =>
    request<CashoutResult>(`/api/round/${roundId}/cashout`, { method: 'POST' }),

  roundResult: (roundId: string) => request<RoundResult>(`/api/round/${roundId}`),
}
