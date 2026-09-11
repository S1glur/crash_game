import {
  ApiError,
  type CashoutResult,
  type GameConfig,
  type GameState,
  type HistoryItem,
  type RoundResult,
  type StartedRound,
  type Theme,
} from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = await response.json()
  if (!response.ok) {
    throw new ApiError(body?.error ?? 'UNKNOWN', body?.message ?? 'Ошибка запроса')
  }
  return body as T
}

export const api = {
  state: () => request<GameState>('/api/state'),

  config: () => request<GameConfig>('/api/config'),

  /** Сохранение настроек из админки. Сервер валидирует значения сам. */
  saveConfig: (config: unknown) =>
    request<GameConfig>('/api/config', { method: 'PUT', body: JSON.stringify(config, null, 2) }),

  rules: () => request<{ content: string }>('/api/rules'),

  /** Пополнение демо-баланса до стартового — чтобы проигрыш не запирал игру. */
  topUp: () => request<{ credited: number; balance: number }>('/api/demo/topup', { method: 'POST' }),

  history: (limit = 20) => request<{ items: HistoryItem[] }>(`/api/history?limit=${limit}`),

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
