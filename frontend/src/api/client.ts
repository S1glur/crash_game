import {
  ApiError,
  type AdminReport,
  type CashoutResult,
  type GameConfig,
  type GameState,
  type HistoryItem,
  type LeaderRow,
  type PlacedBet,
  type RecentRound,
  type RoundResult,
  type RoundView,
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

  /**
   * Журнал раундов файлом. Идёт мимо request(): ответ не JSON, а CSV, и его
   * нужно сохранить на диск, а не разобрать.
   */
  roundsCsv: async (): Promise<Blob> => {
    const response = await fetch('/api/admin/rounds.csv', { credentials: 'include' })
    if (!response.ok) {
      throw new ApiError('EXPORT_FAILED', 'Не удалось выгрузить журнал', response.status)
    }
    return response.blob()
  },

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

  /**
   * Ставка в текущий раунд темы. Если приём уже закрыт, сервер ставит её в
   * очередь на следующий раунд и возвращает queued: true.
   */
  placeBet: (
    theme: Theme,
    stake: number,
    boostOptionId: string,
    autoCashoutAt: number | null,
  ) =>
    request<PlacedBet>("/api/round/bet", {
      method: "POST",
      body: JSON.stringify({ theme, stake, boostOptionId, autoCashoutAt }),
    }),

  /** Отмена ставки до взлёта — с возвратом всей списанной суммы. */
  cancelBet: (theme: Theme) =>
    request<{ balanceAfter: number; round: RoundView }>(`/api/round/${theme}/cancel`, {
      method: "POST",
    }),

  /** Недавние раунды со списком участников. */
  recentRounds: (limit = 20, theme?: Theme) =>
    request<{ items: RecentRound[] }>(
      `/api/rounds/recent?limit=${limit}${theme ? `&theme=${theme}` : ""}`,
    ),

  cashout: (roundId: string) =>
    request<CashoutResult>(`/api/round/${roundId}/cashout`, { method: 'POST' }),

  roundResult: (roundId: string) => request<RoundResult>(`/api/round/${roundId}`),
}
