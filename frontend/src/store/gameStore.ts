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
  BetView,
  BoostOption,
  GameConfig,
  HistoryItem,
  LeaderRow,
  RecentRound,
  RoundEvent,
  RoundPhase,
  RoundResult,
  RoundView,
  StakeLimits,
  Theme,
  User,
} from '../api/types'

export type Phase = 'loading' | 'auth' | 'theme' | 'bet' | 'flight' | 'result' | 'report'

/**
 * Текущий раунд выбранной темы. Цикл идёт непрерывно, поэтому это состояние
 * существует всегда — и когда игрок в нём участвует, и когда просто смотрит.
 */
export interface RoundState {
  roundId: string
  theme: Theme
  phase: RoundPhase
  /** Момент окончания фазы по часам браузера — из него считается обратный отсчёт. */
  phaseEndsAt: number
  resultHash: string
  thresholds: number[]
  /** Где ждёт бустер. Известно до взлёта, поэтому маркер виден сразу. */
  boostLevelIndex: number | null
  /** Последний коэффициент с сервера и момент его получения — между тиками экран интерполирует сам. */
  serverMultiplier: number
  serverMultiplierAt: number
  /** Время полёта на момент последнего тика — нужно экрану, чтобы продолжить разгон. */
  serverElapsedMs: number
  levelsCrossed: number
  betCount: number
  totalStake: number
  /** Все участники раунда — их видно и в лобби, и в полёте. */
  bets: BetView[]
  /** Моя ставка в этом раунде, если я успел её сделать. */
  myBet: BetView | null
  /** Моя ставка, ждущая следующего раунда. */
  queuedBet: BetView | null
  /** Коэффициент краха — появляется, когда раунд завершился. */
  crashAt: number | null
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
  /** Текущий раунд выбранной темы. */
  round: RoundState | null
  /** Личный итог последнего раунда, в котором я участвовал. */
  result: RoundResult | null
  /** Недавние раунды со списком участников — для окна истории. */
  recentRounds: RecentRound[]
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
  /** Поставить в текущий раунд; если приём закрыт — в очередь на следующий. */
  placeBet: () => Promise<void>
  cancelBet: () => Promise<void>
  cashout: () => Promise<void>
  /** Закрыть экран результата и вернуться к лобби, не дожидаясь нового раунда. */
  dismissResult: () => void
  betWithBoost: (boostOptionId: string) => Promise<void>
  loadRecentRounds: () => Promise<void>
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
  round: null,
  result: null,
  recentRounds: [],
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
        round: null,
        result: null,
        recentRounds: [],
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
    set({ theme, result: null })
    // У каждой темы свой независимый цикл, поэтому переподписываемся.
    void watchTheme(theme, set, get)
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
    void watchTheme(get().theme, set, get)
  },

  goToTheme() {
    set({ phase: 'theme' })
  },

  openReport() {
    set({ phase: 'report' })
  },

  async placeBet() {
    const { theme, stake, selectedBoostId, autoCashout } = get()
    try {
      const placed = await api.placeBet(theme, stake, selectedBoostId, autoCashout)
      sound.select()
      set({ balance: placed.balanceAfter, result: null })
      applyRoundView(placed.round, set, get)
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  async cancelBet() {
    try {
      const { balanceAfter, round } = await api.cancelBet(get().theme)
      set({ balance: balanceAfter })
      applyRoundView(round, set, get)
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  async cashout() {
    const round = get().round
    if (!round?.myBet || round.myBet.cashedOutAt !== null) return
    try {
      const result = await api.cashout(get().theme)
      const current = get().round
      if (!current?.myBet) return
      set({
        balance: result.balance,
        round: {
          ...current,
          myBet: {
            ...current.myBet,
            cashedOutAt: result.cashedOutAt,
            winAmount: result.winAmount,
            points: result.pointsSoFar,
          },
        },
      })
      sound.cashout()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  dismissResult() {
    set({ result: null, phase: 'bet' })
  },

  /**
   * Ставка конкретным бустером — так апсейл «Закрепи успех» отправляет игрока
   * в следующий раунд, не возвращая его к выбору фрагмента.
   */
  async betWithBoost(boostOptionId) {
    set({ selectedBoostId: boostOptionId, result: null, phase: 'bet' })
    await get().placeBet()
  },

  async loadRecentRounds() {
    try {
      const { items } = await api.recentRounds(20)
      set({ recentRounds: items })
    } catch (e) {
      set({ error: (e as Error).message })
    }
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
    round: roundFromView(state.rounds[state.theme]),
    phase: 'theme',
  })

  // Цикл идёт непрерывно, поэтому подписываемся сразу: к моменту, когда игрок
  // дойдёт до лобби, у него уже будет живой обратный отсчёт.
  void watchTheme(state.theme, set, useGame.getState)
}

type Setter = (partial: Partial<GameStore>) => void

/** Снимок раунда с сервера -> состояние стора. */
function roundFromView(view: RoundView): RoundState {
  return {
    roundId: view.roundId,
    theme: view.theme,
    phase: view.phase,
    phaseEndsAt: Date.now() + view.phaseRemainingMs,
    resultHash: view.resultHash,
    thresholds: view.levelThresholds,
    boostLevelIndex: view.boostLevelIndex >= 0 ? view.boostLevelIndex : null,
    serverMultiplier: view.multiplier,
    serverMultiplierAt: performance.now(),
    serverElapsedMs: view.elapsedMs,
    levelsCrossed: view.levelsCrossed,
    betCount: view.betCount,
    totalStake: view.totalStake,
    bets: view.bets,
    myBet: view.myBet,
    queuedBet: view.queuedBet,
    crashAt: view.phase === 'RESULT' ? view.multiplier : null,
  }
}

function applyRoundView(view: RoundView, set: Setter, get: () => GameStore) {
  set({ round: roundFromView(view) })
  syncScreen(set, get)
}

/**
 * Экран следует за фазой раунда, а не за действиями игрока: цикл идёт сам, и
 * решает, что показывать, именно он. Экраны вне игры — вход, выбор темы,
 * отчётность — не трогаем, иначе игрока выдёргивало бы из них каждые 15 секунд.
 */
function syncScreen(set: Setter, get: () => GameStore) {
  const { phase, round } = get()
  if (!round) return
  if (phase !== 'bet' && phase !== 'flight' && phase !== 'result') return

  if (round.phase === 'FLYING' && phase !== 'flight') {
    set({ phase: 'flight' })
  } else if (round.phase === 'BETTING' && phase !== 'bet') {
    // Новый приём ставок — прошлый результат больше не на экране.
    set({ phase: 'bet', result: null })
  }
}

/**
 * Подписка на цикл выбранной темы. У зелёной и красной свои независимые
 * раунды, поэтому при смене темы подписку надо переставить, а не добавить.
 */
async function watchTheme(theme: Theme, set: Setter, get: () => GameStore) {
  unsubscribe?.()
  unsubscribe = null
  stopWatchdog()

  try {
    const state = await api.state()
    set({ balance: state.balance })
    applyRoundView(state.rounds[theme], set, get)
  } catch {
    // Сеть недоступна — состояние подтянет сторож на следующем интервале.
  }

  startWatchdog(theme, set, get)
  unsubscribe = subscribeToRound(theme, (event) => handleRoundEvent(theme, event, set, get))
}

function handleRoundEvent(
  theme: Theme,
  event: RoundEvent,
  set: Setter,
  get: () => GameStore,
) {
  const round = get().round
  if (!round || round.theme !== theme) return
  const myId = get().user?.id

  switch (event.type) {
    case 'phase': {
      /*
        Фаза сменилась — перечитываем состояние целиком. Это единственный
        момент, когда в раунд могла въехать отложенная ставка, а угадывать
        такое по событиям значит однажды разойтись с сервером.
      */
      if (event.phase === 'FLYING') sound.launch()
      void refreshRound(theme, set, get)
      break
    }

    case 'bet': {
      // Чужая ставка в лобби: показываем сразу, не дожидаясь смены фазы.
      const bets = event.playerId && event.playerId !== myId && event.player
        ? [
            ...round.bets.filter((bet) => bet.playerId !== event.playerId),
            {
              playerId: event.playerId,
              player: event.player,
              stake: event.stake ?? 0,
              boostFee: 0,
              totalPaid: event.stake ?? 0,
              boostTier: event.boostTier ?? 1,
              boostMultiplier: 1,
              boostApplied: false,
              autoCashoutAt: null,
              cashedOutAt: null,
              winAmount: 0,
              points: 0,
            } satisfies BetView,
          ]
        : round.bets
      set({ round: { ...round, betCount: event.betCount, totalStake: event.totalStake, bets } })
      break
    }

    case 'tick':
      set({
        round: {
          ...round,
          serverMultiplier: event.multiplier,
          serverMultiplierAt: performance.now(),
          serverElapsedMs: event.elapsedMs,
        },
      })
      break

    case 'level':
      set({ round: { ...round, levelsCrossed: event.levelIndex + 1 } })
      if (round.myBet) sound.level(event.levelIndex)
      break

    case 'boost': {
      const firedIds = new Set(event.fired.map((item) => item.playerId))
      if (firedIds.size === 0) break
      const mark = (bet: BetView) =>
        firedIds.has(bet.playerId) ? { ...bet, boostApplied: true } : bet
      set({
        round: {
          ...round,
          bets: round.bets.map(mark),
          myBet: round.myBet ? mark(round.myBet) : null,
        },
      })
      if (myId && firedIds.has(myId)) sound.boost()
      break
    }

    case 'cashout': {
      const patch = (bet: BetView) =>
        bet.playerId === event.playerId
          ? {
              ...bet,
              cashedOutAt: event.multiplier,
              winAmount: event.winAmount,
              points: event.points,
            }
          : bet
      const mine = round.myBet && round.myBet.playerId === event.playerId
      // Автовывод сработал на сервере — баланс на клиенте о нём ещё не знает.
      // Ручной вывод уже начислен ответом REST, второй раз добавлять нельзя.
      const creditAuto = mine && event.auto && round.myBet?.cashedOutAt === null
      set({
        round: {
          ...round,
          bets: round.bets.map(patch),
          myBet: round.myBet ? patch(round.myBet) : null,
        },
        ...(creditAuto ? { balance: get().balance + event.winAmount } : {}),
      })
      if (mine && event.auto) sound.cashout()
      break
    }

    case 'round.finished': {
      set({
        round: {
          ...round,
          phase: 'RESULT',
          crashAt: event.crashAt,
          serverMultiplier: event.crashAt,
          serverMultiplierAt: performance.now(),
        },
      })
      if (round.myBet) {
        sound.crash()
        void finishRound(event.roundId, set, get)
      }
      void get().refreshHistory()
      break
    }
  }
}

/** Перечитывает раунд темы с сервера — источник правды при любых сомнениях. */
async function refreshRound(theme: Theme, set: Setter, get: () => GameStore) {
  try {
    const state = await api.state()
    set({ balance: state.balance })
    applyRoundView(state.rounds[theme], set, get)
  } catch {
    // Пропускаем: следующий тик или сторож повторят попытку.
  }
}

function startWatchdog(theme: Theme, set: Setter, get: () => GameStore) {
  stopWatchdog()
  watchdog = window.setInterval(() => {
    const round = get().round
    if (!round || round.theme !== theme) {
      stopWatchdog()
      return
    }
    // Молчание опасно только в полёте: там экран сам достраивает коэффициент
    // и без свежих данных разгонит его в бесконечность.
    if (round.phase !== 'FLYING') return
    if (performance.now() - round.serverMultiplierAt < SILENCE_BEFORE_RESYNC_MS) return
    void resync(theme, set, get)
  }, WATCHDOG_INTERVAL_MS)
}

/**
 * Сервер молчит дольше, чем должен. Спрашиваем состояние напрямую: либо раунд
 * ещё летит и мы подтягиваем настоящий коэффициент вместо самодельного, либо
 * он давно завершился — и тогда показываем результат.
 */
async function resync(theme: Theme, set: Setter, get: () => GameStore) {
  if (resyncing) return
  resyncing = true
  try {
    const before = get().round
    await refreshRound(theme, set, get)
    const after = get().round
    if (before?.myBet && after && after.roundId !== before.roundId) {
      // Раунд успел смениться, а события до нас не дошли — добираем свой итог.
      await finishRound(before.roundId, set, get)
    }
  } finally {
    resyncing = false
  }
}

/**
 * После краха берём личный итог отдельным запросом, а не из WS-события:
 * в нём нет награды и данных для проверки честности, а при обрыве соединения
 * событие можно вообще не получить.
 */
async function finishRound(roundId: string, set: Setter, get: () => GameStore) {
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
  } catch {
    // Ставки в этом раунде не было — показывать нечего, остаёмся в лобби.
  }
}
