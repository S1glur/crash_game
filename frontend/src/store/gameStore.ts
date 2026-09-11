import { create } from 'zustand'
import { api } from '../api/client'
import {
  closeSocket,
  connectSocket,
  subscribeToFeed,
  subscribeToLeaderboard,
  subscribeToRound,
} from '../api/roundSocket'
import { sound } from '../utils/sound'
import { ApiError } from '../api/types'
import type {
  BoostOption,
  GameConfig,
  HistoryItem,
  LeaderRow,
  RoundResult,
  StakeLimits,
  Theme,
  User,
} from '../api/types'

export type Phase = 'loading' | 'auth' | 'theme' | 'bet' | 'flight' | 'result' | 'report'

interface FlightState {
  roundId: string
  /** Ставка — от неё считается выигрыш. */
  stake: number
  /** Доплата за бустер: сгорает всегда, в выплате не участвует. */
  boostFee: number
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
  /** Вошедший аккаунт. null — показываем экран входа. */
  user: User | null
  balance: number
  theme: Theme
  stakeLimits: StakeLimits
  boostOptions: BoostOption[]
  levelsCount: Record<Theme, number>
  config: GameConfig | null
  history: HistoryItem[]
  /** Турнирная таблица всех участников — живая, приходит по WebSocket. */
  leaders: LeaderRow[]
  /** Сумма ставки, выбранная игроком; переживает раунды. */
  stake: number
  selectedBoostId: string
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
  /** Бросают ApiError с текстом от сервера — форма входа показывает его рядом с полями. */
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
  refreshHistory: () => Promise<void>
  reloadConfig: () => Promise<void>
  setTheme: (theme: Theme) => void
  setStake: (value: number) => void
  selectBoost: (boostOptionId: string) => void
  setAutoCashout: (value: number | null) => void
  goToBet: () => void
  goToTheme: () => void
  openReport: () => void
  startRound: () => Promise<void>
  cashout: () => Promise<void>
  playAgain: () => void
  repeatBet: () => Promise<void>
  startWithBoost: (boostOptionId: string) => Promise<void>
  topUp: () => Promise<void>
  /** Доплата за выбранный бустер при текущей ставке — та же формула, что на сервере. */
  boostFee: (boostOptionId?: string) => number
  /** Сколько всего спишется с баланса: ставка плюс доплата. */
  totalCost: (boostOptionId?: string) => number
  dismissError: () => void
  markOnboardingSeen: () => void
  markUpsellShown: () => void
}

let unsubscribe: (() => void) | null = null

/**
 * Сторож молчащего сервера.
 *
 * Экран полёта достраивает коэффициент между тиками сам, и если события
 * перестают приходить — оборвался сокет, раунд кончился раньше, чем оформилась
 * подписка — он разгоняет число до бесконечности, а игрок остаётся в полёте,
 * которого давно нет. Поэтому после паузы в тиках спрашиваем состояние у
 * сервера напрямую по REST.
 */
let watchdog: number | null = null
let resyncing = false

const SILENCE_BEFORE_RESYNC_MS = 1500
const WATCHDOG_INTERVAL_MS = 700

function stopWatchdog() {
  if (watchdog !== null) {
    clearInterval(watchdog)
    watchdog = null
  }
}

export const useGame = create<GameStore>((set, get) => ({
  phase: 'loading',
  error: null,
  user: null,
  balance: 0,
  theme: 'green',
  stakeLimits: { min: 10, max: 400, step: 5, presets: [] },
  boostOptions: [],
  levelsCount: { green: 9, red: 12 },
  config: null,
  history: [],
  leaders: [],
  stake: 50,
  selectedBoostId: 'no-boost',
  autoCashout: null,
  flight: null,
  result: null,
  totalPoints: 0,
  rewards: [],
  onboardingSeen: false,
  upsellShown: false,

  async init() {
    try {
      await loadGame(set)
    } catch (e) {
      // Отсутствие сессии — не ошибка, а обычный первый заход на страницу.
      if (e instanceof ApiError && e.status === 401) {
        set({ phase: 'auth', user: null })
        return
      }
      set({ error: (e as Error).message, phase: 'auth' })
    }
  },

  async login(username, password) {
    await api.login(username, password)
    await loadGame(set)
  },

  async register(username, password, displayName) {
    await api.register(username, password, displayName)
    await loadGame(set)
  },

  async logout() {
    unsubscribe?.()
    unsubscribe = null
    stopWatchdog()
    closeSocket()
    try {
      await api.logout()
    } finally {
      // Чистим всё, что связано с аккаунтом: баланс, история и награды
      // следующего вошедшего не должны начинаться с чужих значений.
      set({
        phase: 'auth',
        user: null,
        error: null,
        balance: 0,
        flight: null,
        result: null,
        history: [],
        leaders: [],
        totalPoints: 0,
        rewards: [],
        upsellShown: false,
      })
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
    set({ theme })
  },

  setStake(value) {
    const { min, max, step } = get().stakeLimits
    // Округляем к сетке шага: сервер отвергнет ставку не по шагу, и лучше
    // поправить её здесь, чем показать игроку ошибку валидации.
    const snapped = min + Math.round((value - min) / step) * step
    set({ stake: Math.min(max, Math.max(min, snapped)) })
  },

  selectBoost(boostOptionId) {
    sound.select()
    set({ selectedBoostId: boostOptionId })
  },

  boostFee(boostOptionId) {
    const { boostOptions, selectedBoostId, stake } = get()
    const id = boostOptionId ?? selectedBoostId
    const option = boostOptions.find((candidate) => candidate.id === id)
    // Вверх, как на сервере: иначе подсказка на копейку разойдётся со списанием.
    return option ? Math.ceil(stake * option.priceFactor) : 0
  },

  totalCost(boostOptionId) {
    return get().stake + get().boostFee(boostOptionId)
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

  openReport() {
    set({ phase: 'report' })
  },

  async startRound() {
    const { theme, stake, selectedBoostId, autoCashout } = get()
    try {
      const started = await api.startRound(theme, stake, selectedBoostId, {
        autoCashoutAt: autoCashout,
      })
      sound.launch()
      set({
        balance: started.balanceAfter,
        phase: 'flight',
        result: null,
        flight: {
          roundId: started.roundId,
          stake: started.stake,
          boostFee: started.boostFee,
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
      startWatchdog(started.roundId, set, get)
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
   * Взлёт конкретным бустером, минуя экран выбора — так апсейл «Закрепи успех»
   * уводит игрока прямо в полёт с предложенным фрагментом. Ставка остаётся той,
   * что игрок выбрал сам.
   */
  async startWithBoost(boostOptionId) {
    set({ selectedBoostId: boostOptionId, result: null, flight: null })
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
 * Загрузка игры под текущей сессией. Вынесена отдельно, потому что нужна в трёх
 * местах одинаково: при открытии страницы, после входа и после регистрации.
 */
async function loadGame(set: (partial: Partial<GameStore>) => void) {
  const [state, config, history, leaderboard] = await Promise.all([
    api.state(),
    api.config(),
    api.history(20),
    api.leaderboard(),
  ])

  // Соединение поднимаем сразу, а не в момент старта раунда: иначе первый же
  // короткий полёт заканчивается раньше, чем оно успевает установиться.
  connectSocket()

  /*
    Общие каналы. Подписки идемпотентны — они хранятся по имени топика, поэтому
    повторный вход в аккаунт не удваивает обработчики.

    Таблица приходит готовой, с местами и очками: пересчитывать её на клиенте
    нельзя, иначе у каждого будет свой вариант рейтинга.
  */
  subscribeToLeaderboard((rows) => set({ leaders: rows }))

  // Чужой раунд завершился — обновляем историю игр. Она общая по ТЗ, и без
  // этого чужие полёты появлялись бы в ней только после перезагрузки страницы.
  subscribeToFeed(() => {
    void useGame.getState().refreshHistory()
  })

  set({
    user: state.user,
    balance: state.balance,
    theme: state.theme,
    stakeLimits: state.stake,
    boostOptions: state.boostOptions,
    levelsCount: state.levelsCount,
    config,
    history: history.items,
    leaders: leaderboard.rows,
    // Очки берём с сервера: теперь они копятся в аккаунте, а не в сессии вкладки.
    totalPoints: state.user.totalPoints,
    // Стартовая ставка — первый пресет из конфига, иначе минимальная.
    stake: state.stake.presets[0] ?? state.stake.min,
    selectedBoostId: state.boostOptions[0]?.id ?? 'no-boost',
    phase: 'theme',
  })
}

function startWatchdog(
  roundId: string,
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
) {
  stopWatchdog()
  watchdog = window.setInterval(() => {
    const flight = get().flight
    if (!flight || flight.roundId !== roundId || flight.finished) {
      stopWatchdog()
      return
    }
    if (performance.now() - flight.serverMultiplierAt < SILENCE_BEFORE_RESYNC_MS) {
      return
    }
    void resync(roundId, set, get)
  }, WATCHDOG_INTERVAL_MS)
}

/**
 * Сервер молчит дольше, чем должен. Спрашиваем у него состояние напрямую:
 * либо раунд ещё летит и мы подтягиваем настоящий коэффициент вместо
 * самодельного, либо он давно завершён — и тогда показываем результат.
 */
async function resync(
  roundId: string,
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
) {
  if (resyncing) return
  resyncing = true
  try {
    const state = await api.state()
    const flight = get().flight
    if (!flight || flight.roundId !== roundId || flight.finished) return

    const active = state.activeRound
    if (active && active.roundId === roundId) {
      set({
        balance: state.balance,
        flight: {
          ...flight,
          serverMultiplier: active.multiplier,
          serverMultiplierAt: performance.now(),
          serverElapsedMs: active.elapsedMs,
          levelsCrossed: active.levelsCrossed,
          points: active.points,
          boostApplied: active.boostApplied,
          cashedOutAt: active.cashedOutAt,
          winAmount: active.winAmount,
        },
      })
      return
    }

    // Среди активных раунда нет — он завершился, а событие до нас не дошло.
    stopWatchdog()
    set({ flight: { ...flight, finished: true } })
    await finishRound(roundId, set, get)
  } catch {
    // Сеть недоступна — сторож попробует ещё раз на следующем интервале.
  } finally {
    resyncing = false
  }
}

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
  stopWatchdog()
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
