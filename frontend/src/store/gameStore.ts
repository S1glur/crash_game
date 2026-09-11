import { create } from 'zustand'
import { api } from '../api/client'
import { subscribeToRound } from '../api/roundSocket'
import { sound } from '../utils/sound'
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
  /** Время раунда на момент последнего тика — нужно экрану, чтобы продолжить разгон. */
  serverElapsedMs: number
  levelsCrossed: number
  points: number
  /** Где ждёт бустер. Известно до взлёта, поэтому маркер виден сразу. */
  boostLevelIndex: number | null
  /** Сработал ли бустер — до этого маркер показываем приглушённым. */
  boostApplied: boolean
  /** Порог автовывода, заданный до старта (null — выключен). */
  autoCashoutAt: number | null
  /** Сработал ли вывод сам, а не по кнопке — для текста на экране. */
  cashedOutAuto: boolean
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
  /** Выбранный игроком порог автовывода, переживает раунды. */
  autoCashout: number | null
  flight: FlightState | null
  result: RoundResult | null
  /** Очки игрока за сессию — из них строится турнирная таблица. */
  totalPoints: number
  /** Собранные за сессию награды: бэкенд их не накапливает, ведём у себя. */
  rewards: string[]
  onboardingSeen: boolean
  /** Апсейл показываем не чаще раза за сессию — требование ТЗ к сценарию 8. */
  upsellShown: boolean

  init: () => Promise<void>
  refreshHistory: () => Promise<void>
  reloadConfig: () => Promise<void>
  setTheme: (theme: Theme) => void
  selectBet: (betOptionId: string | null) => void
  setAutoCashout: (value: number | null) => void
  goToBet: () => void
  goToTheme: () => void
  startRound: () => Promise<void>
  cashout: () => Promise<void>
  playAgain: () => void
  repeatBet: () => Promise<void>
  startWithBet: (betOptionId: string) => Promise<void>
  topUp: () => Promise<void>
  dismissError: () => void
  markOnboardingSeen: () => void
  markUpsellShown: () => void
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
  autoCashout: null,
  flight: null,
  result: null,
  totalPoints: 0,
  rewards: [],
  onboardingSeen: false,
  upsellShown: false,

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

  /** Перечитать конфиг после сохранения в админке. */
  async reloadConfig() {
    set({ config: await api.config() })
  },

  async refreshHistory() {
    const history = await api.history(20)
    set({ history: history.items })
  },

  setTheme(theme) {
    sound.select()
    set({ theme, selectedBetId: null })
  },

  selectBet(betOptionId) {
    set({ selectedBetId: betOptionId })
  },

  setAutoCashout(value) {
    set({ autoCashout: value })
  },

  goToBet() {
    set({ phase: 'bet' })
  },

  goToTheme() {
    set({ phase: 'theme' })
  },

  async startRound() {
    const { theme, selectedBetId, autoCashout } = get()
    if (!selectedBetId) return
    try {
      const started = await api.startRound(theme, selectedBetId, { autoCashoutAt: autoCashout })
      sound.launch()
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
          serverElapsedMs: 0,
          levelsCrossed: 0,
          points: 0,
          boostLevelIndex: started.boostLevelIndex >= 0 ? started.boostLevelIndex : null,
          boostApplied: false,
          autoCashoutAt: started.autoCashoutAt,
          cashedOutAuto: false,
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
                serverElapsedMs: event.elapsedMs,
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
            sound.level(event.levelIndex)
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
            sound.boost()
            break

          case 'cashout':
            // Ручной вывод уже обновил состояние по ответу REST; повторное
            // событие игнорируем, чтобы не перетереть его самим собой.
            if (!flight.cashedOutAt) {
              set({
                flight: {
                  ...flight,
                  cashedOutAt: event.multiplier,
                  cashedOutAuto: event.auto,
                  winAmount: event.winAmount,
                  points: event.points,
                },
                balance: get().balance + event.winAmount,
              })
              sound.cashout()
            }
            break

          case 'round.finished': {
            set({
              flight: { ...get().flight!, finished: true, points: event.points },
            })
            sound.crash()
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
          cashedOutAuto: false,
          winAmount: result.winAmount,
          points: result.pointsSoFar,
        },
        balance: get().balance + result.winAmount,
      })
      sound.cashout()
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

  /**
   * Взлёт конкретным вариантом ставки, минуя экран выбора — так апсейл
   * «Закрепи успех» уводит игрока прямо в полёт с предложенным фрагментом.
   */
  async startWithBet(betOptionId) {
    set({ selectedBetId: betOptionId, result: null, flight: null })
    await get().startRound()
  },

  /** Пополнение демо-баланса до стартового — выход из тупика «нечем играть». */
  async topUp() {
    try {
      const { balance } = await api.topUp()
      sound.select()
      set({ balance })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  dismissError() {
    set({ error: null })
  },

  markOnboardingSeen() {
    set({ onboardingSeen: true })
  },

  markUpsellShown() {
    set({ upsellShown: true })
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
