/**
 * Типы ответов бэкенда. Сверено с живым API, а не только с docs/api.md:
 * GET /api/round/{id} отдаёт больше полей, чем описано в контракте
 * (balance, crashPointRaw, boostLevelIndex) — они нужны для проверки честности.
 */

export type Theme = 'green' | 'red'
export type Outcome = 'cashout' | 'crash'
export type Role = 'ADMIN' | 'PLAYER'

/** Аккаунт, под которым открыта игра. Пароль наружу не отдаётся никогда. */
export interface User {
  id: string
  username: string
  displayName: string
  role: Role
  balance: number
  totalPoints: number
}

/**
 * Вариант бустера. Цена не фиксированная, а доля от ставки (priceFactor):
 * доплата = ставка × priceFactor. Считать её на клиенте можно только для
 * подсказки — окончательную сумму пересчитывает сервер при старте раунда.
 */
export interface BoostOption {
  id: string
  boostTier: number
  priceFactor: number
  boostMultiplier: number
}

/** Границы свободной ставки из конфига. */
export interface StakeLimits {
  min: number
  max: number
  step: number
  presets: number[]
}

export interface ActiveRoundView {
  roundId: string
  theme: Theme
  stake: number
  boostFee: number
  totalPaid: number
  boostMultiplier: number
  levelsCount: number
  levelThresholds: number[]
  /** Уровень, на котором ждёт бустер; -1 — ставка без бустера. */
  boostLevelIndex: number
  resultHash: string
  multiplier: number
  levelsCrossed: number
  boostApplied: boolean
  points: number
  elapsedMs: number
  cashedOutAt: number | null
  winAmount: number
}

export interface GameState {
  user: User
  balance: number
  theme: Theme
  activeRound: ActiveRoundView | null
  stake: StakeLimits
  boostOptions: BoostOption[]
  levelsCount: Record<Theme, number>
}

export interface StartedRound {
  roundId: string
  theme: Theme
  stake: number
  boostFee: number
  totalPaid: number
  boostMultiplier: number
  levelsCount: number
  levelThresholds: number[]
  /** Уровень, на котором ждёт бустер; -1 — ставка без бустера. */
  boostLevelIndex: number
  /** Порог автовывода, если игрок его задал. */
  autoCashoutAt: number | null
  resultHash: string
  balanceAfter: number
}

export interface CashoutResult {
  roundId: string
  cashedOutAt: number
  winAmount: number
  pointsSoFar: number
}

export interface RoundResult {
  roundId: string
  theme: Theme
  stake: number
  boostFee: number
  totalPaid: number
  outcome: Outcome
  cashedOutAt: number | null
  crashAt: number
  winAmount: number
  points: number
  reward: { type: string; id: string }
  balance: number
  resultHash: string
  serverSeed: string
  crashPointRaw: string
  boostLevelIndex: number
}

export interface HistoryItem {
  roundId: string
  /** История общая для всех участников — без имени свой полёт в ней не найти. */
  playerId: string
  player: string
  theme: Theme
  stake: number
  totalPaid: number
  result: Outcome
  multiplier: number
  winAmount: number
  points: number
  finishedAt: string
}

/**
 * Строка турнирной таблицы. Очки настоящие и серверные: накопленные в аккаунте
 * плюс набранные прямо сейчас, в ещё не завершённом раунде.
 */
export interface LeaderRow {
  playerId: string
  name: string
  points: number
  /** Игрок сейчас в воздухе — его очки ещё растут. */
  inFlight: boolean
  place: number
}

/** Событие общей ленты: кто-то из участников завершил раунд. */
export interface FeedItem {
  roundId: string
  player: string
  theme: Theme
  stake: number
  outcome: Outcome
  multiplier: number
  winAmount: number
  points: number
}

/** Отчёт администратора: GET /api/admin/report. */
export interface AdminReport {
  generatedAt: string
  totals: {
    players: number
    rounds: number
    staked: number
    boostFees: number
    totalPaid: number
    paidOut: number
    houseNet: number
    /** Выплачено на каждый уплаченный балл, считая доплату за бустер. */
    rtp: number
    pointsAwarded: number
    cashoutRounds: number
    crashRounds: number
    cashoutShare: number
    meanCrash: number
    medianCrash: number
    maxCrash: number
  }
  crashDistribution: { from: number; to: number | null; count: number; share: number }[]
  boostTiers: {
    tier: number
    rounds: number
    applied: number
    appliedShare: number
    feesPaid: number
    wonWith: number
  }[]
  themes: { theme: Theme; rounds: number; totalPaid: number; paidOut: number; rtp: number }[]
  players: {
    id: string
    username: string
    displayName: string
    role: Role
    balance: number
    totalPoints: number
    rounds: number
    staked: number
    totalPaid: number
    paidOut: number
    net: number
    roundPoints: number
    bestMultiplier: number
  }[]
  recent: {
    roundId: string
    player: string
    theme: Theme
    stake: number
    totalPaid: number
    outcome: Outcome
    multiplier: number
    crashAt: number
    winAmount: number
    points: number
    boostTier: number
    boostApplied: boolean
    finishedAt: string
  }[]
}

/** Срез config/game.json — фронту нужны только эти ветки. */
export interface GameConfig {
  /** Баланс нового аккаунта; до него же пополняет POST /api/demo/topup. */
  demo_user: { starting_balance: number }
  stake: { min: number; max: number; step: number; presets: number[] }
  boost_options: { id: string; boost_tier: number; price_factor: number }[]
  themes: Record<
    Theme,
    {
      levels_count: number
      level_thresholds: number[]
      loot_probabilities: Record<string, number>
    }
  >
  crash_model: {
    alpha: number
    max_multiplier: number
    min_crash_multiplier: number
    multiplier_growth_rate: number
    growth_acceleration_base: number
    fps: number
    delta: number
  }
  boost_tiers: Record<string, number>
  points: {
    points_per_line: number
    points_cashout_bonus: number
    points_boost_bonus: number
  }
  /** Порог и время жизни апсейл-попапа «Закрепи успех» (сценарий 8 ТЗ). */
  upsell: {
    min_win_amount: number
    popup_timeout_sec: number
  }
  ui: {
    result_screen_auto_advance_sec: number
    onboarding_hint_duration_sec: number
  }
  dev_mode: { enabled: boolean }
}

/** События WebSocket-топика /topic/round/{roundId}. */
export type RoundEvent =
  | { type: 'tick'; multiplier: number; elapsedMs: number }
  | { type: 'level'; levelIndex: number; pointsAwarded: number; totalPoints: number }
  | { type: 'boost'; levelIndex: number; boostMultiplier: number; multiplierAfter: number }
  | { type: 'cashout'; multiplier: number; winAmount: number; points: number; auto: boolean }
  | {
      type: 'round.finished'
      crashAt: number
      outcome: Outcome
      winAmount: number
      points: number
      serverSeed: string
    }

export class ApiError extends Error {
  code: string
  /** Нужен, чтобы отличить «нет сессии» (401) от обычной ошибки и показать экран входа. */
  status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}
