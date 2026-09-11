import { create } from 'zustand'
import { api } from '../api/client'
import { subscribeToRound } from '../api/roundSocket'
import type {
  BetOption,
  GameConfig,
  HistoryItem,
  RoundResult,
  Theme,
} from '../api/types'

export type Phase = 'loading' | 'theme' | 'bet' | 'flight' | 'result'

interface FlightState {
  roundId: string
  bet: number
  boostMultiplier: number
  thresholds: number[]
  resultHash: string
  /** Последний коэффициент, пришедший с сервера, и момент его получения — между тиками экран интерполирует сам. */
  serverMultiplier: number
  serverMultiplierAt: number
  levelsCrossed: number
  points: number
  /** Где ждёт бустер. Известно до взлёта, поэтому маркер виден сразу. */
  boostLevelIndex: number | null
  /** Сработал ли бустер — до этого маркер показываем приглушённым. */
  boostApplied: boolean
  cashedOutAt: number | null
  winAmount: number
  finished: boolean
}

interface GameStore {
  phase: Phase
  error: string | null
  balance: number
  theme: Theme
  betOptions: Record<Theme, BetOption[]>
  levelsCount: Record<Theme, number>
  config: GameConfig | null
  history: HistoryItem[]
  selectedBetId: string | null
  flight: FlightState | null
  result: RoundResult | null
  /** Очки игрока за сессию — из них строится турнирная таблица. */
  totalPoints: number
  /** Собранные за сессию награды: бэкенд их не накапливает, ведём у себя. */
  rewards: string[]
  onboardingSeen: boolean

  init: () => Promise<void>
  refreshHistory: () => Promise<void>
  setTheme: (theme: Theme) => void
  selectBet: (betOptionId: string | null) => void
  goToBet: () => void
  goToTheme: () => void
  startRound: () => Promise<void>
  cashout: () => Promise<void>
  playAgain: () => void
  repeatBet: () => Promise<void>
  dismissError: () => void
  markOnboardingSeen: () => void
}

let unsubscribe: (() => void) | null = null

export const useGame = create<GameStore>((set, get) => ({
  phase: 'loading',
  error: null,
  balance: 0,
  theme: 'green',
  betOptions: { green: [], red: [] },
  levelsCount: { green: 9, red: 12 },
  config: null,
  history: [],
  selectedBetId: null,
  flight: null,
  result: null,
  totalPoints: 0,
  rewards: [],
  onboardingSeen: false,

  async init() {
    try {
      const [state, config, history] = await Promise.all([
        api.state(),
        api.config(),
        api.history(20),
      ])
      set({
        balance: state.balance,
        theme: state.theme,
        betOptions: state.betOptions,
        levelsCount: state.levelsCount,
        config,
        history: history.items,
        phase: 'theme',
      })
    } catch (e) {
      set({ error: (e as Error).message, phase: 'theme' })
    }
  },

  async refreshHistory() {
    const history = await api.history(20)
    set({ history: history.items })
  },

  setTheme(theme) {
    set({ theme, selectedBetId: null })
  },

  selectBet(betOptionId) {
    set({ selectedBetId: betOptionId })
  },

  goToBet() {
    set({ phase: 'bet' })
  },

  goToTheme() {
    set({ phase: 'theme' })
  },

  async startRound() {
    const { theme, selectedBetId } = get()
    if (!selectedBetId) return
    try {
      const started = await api.startRound(theme, selectedBetId)
      set({
        balance: started.balanceAfter,
        phase: 'flight',
        result: null,
        flight: {
          roundId: started.roundId,
          bet: started.bet,
          boostMultiplier: started.boostMultiplier,
          thresholds: started.levelThresholds,
          resultHash: started.resultHash,
          serverMultiplier: 1,
          serverMultiplierAt: performance.now(),
          levelsCrossed: 0,
          points: 0,
          boostLevelIndex: started.boostLevelIndex >= 0 ? started.boostLevelIndex : null,
          boostApplied: false,
          cashedOutAt: null,
          winAmount: 0,
          finished: false,
        },
      })

      unsubscribe?.()
      unsubscribe = subscribeToRound(started.roundId, (event) => {
        const flight = get().flight
        if (!flight || flight.roundId !== started.roundId) return

        switch (event.type) {
          case 'tick':
            set({
              flight: {
                ...flight,
                serverMultiplier: event.multiplier,
                serverMultiplierAt: performance.now(),
              },
            })
            break

          case 'level':
            set({
              flight: {
                ...flight,
                levelsCrossed: event.levelIndex + 1,
                points: event.totalPoints,
              },
            })
            break

          case 'boost':
            set({
              flight: {
                ...flight,
                boostLevelIndex: event.levelIndex,
                boostApplied: true,
                serverMultiplier: event.multiplierAfter,
                serverMultiplierAt: performance.now(),
              },
            })
            break

          case 'round.finished': {
            set({
              flight: { ...get().flight!, finished: true, points: event.points },
            })
            void finishRound(started.roundId, set, get)
            break
          }
        }
      })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  async cashout() {
    const flight = get().flight
    if (!flight || flight.cashedOutAt !== null) return
    try {
      const result = await api.cashout(flight.roundId)
      const current = get().flight
      if (!current) return
      set({
        flight: {
          ...current,
          cashedOutAt: result.cashedOutAt,
          winAmount: result.winAmount,
          points: result.pointsSoFar,
        },
        balance: get().balance + result.winAmount,
      })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  playAgain() {
    set({ phase: 'bet', result: null, flight: null })
  },

  /** Мгновенный повтор: тот же вариант ставки, без возврата к выбору фрагмента. */
  async repeatBet() {
    set({ result: null, flight: null })
    await get().startRound()
  },

  dismissError() {
    set({ error: null })
  },

  markOnboardingSeen() {
    set({ onboardingSeen: true })
  },
}))

/**
 * После краха берём итог отдельным запросом, а не из WS-события:
 * в нём нет награды и данных для проверки честности, а при обрыве
 * соединения событие можно вообще не получить.
 */
async function finishRound(
  roundId: string,
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
) {
  unsubscribe?.()
  unsubscribe = null
  try {
    const result = await api.roundResult(roundId)
    set({
      result,
      phase: 'result',
      balance: result.balance,
      totalPoints: get().totalPoints + result.points,
      rewards: [...get().rewards, result.reward.id].slice(-6),
    })
    await get().refreshHistory()
  } catch (e) {
    set({ error: (e as Error).message, phase: 'bet' })
  }
}
