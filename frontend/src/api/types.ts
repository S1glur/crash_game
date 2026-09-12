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

/** Фаза непрерывного цикла раундов. */
export type RoundPhase = 'BETTING' | 'FLYING' | 'RESULT'

/** Ставка одного участника в общем раунде. */
export interface BetView {
  playerId: string
  player: string
  stake: number
  boostFee: number
  totalPaid: number
  boostTier: number
  boostMultiplier: number
  /** Сработал ли бустер. Уровень общий, множитель — свой у каждого участника. */
  boostApplied: boolean
  autoCashoutAt: number | null
  cashedOutAt: number | null
  winAmount: number
  points: number
}

/**
 * Снимок текущего раунда темы. Приходит и в /api/state, и в ответе на ставку —
 * одного набора полей хватает, чтобы собрать экран целиком после F5.
 */
export interface RoundView {
  roundId: string
  theme: Theme
  phase: RoundPhase
  /** Сколько осталось до конца фазы. В полёте равно нулю — там ждём краха. */
  phaseRemainingMs: number
  levelsCount: number
  levelThresholds: number[]
  /** Уровень, на котором ждёт бустер; -1 — бустера в раунде нет. */
  boostLevelIndex: number
  resultHash: string
  /** Коэффициент один на всех: бустер умножает не его, а личную выплату. */
  multiplier: number
  levelsCrossed: number
  elapsedMs: number
  betCount: number
  totalStake: number
  bets: BetView[]
  myBet: BetView | null
  /** Ставка, сделанная не вовремя и ждущая следующего раунда. */
  queuedBet: BetView | null
}

export interface GameState {
  user: User
  balance: number
  theme: Theme
  /** Текущий раунд каждой темы — у зелёной и красной свои независимые циклы. */
  rounds: Record<Theme, RoundView>
  stake: StakeLimits
  boostOptions: BoostOption[]
  levelsCount: Record<Theme, number>
}

/** Ответ на приём ставки. queued — приём был закрыт, ставка ждёт следующего раунда. */
export interface PlacedBet {
  queued: boolean
  theme: Theme
  roundId: string | null
  balanceAfter: number
  round: RoundView
}

/** Завершённый раунд со всеми участниками — для экрана «недавние раунды». */
export interface RecentRound {
  roundId: string
  theme: Theme
  crashAt: number
  betCount: number
  totalStake: number
  totalWin: number
  boostLevelIndex: number
  resultHash: string
  serverSeed: string
  crashPointRaw: string
  finishedAt: string
  participants: (BetView & { outcome: Outcome })[]
}

export interface CashoutResult {
  roundId: string
  cashedOutAt: number
  winAmount: number
  pointsSoFar: number
  balance: number
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
  /** Длительности фаз непрерывного цикла раундов. */
  round_cycle: { betting_seconds: number; result_seconds: number; speed_factor: number }
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

/**
 * События WebSocket-топика /topic/round/{theme}.
 *
 * Топик теперь на тему, а не на раунд: цикл непрерывный, и подписка переживает
 * смену раундов. Событие phase — единственный источник правды о том, что
 * происходит сейчас, по нему экран и переключается.
 */
export type RoundEvent =
  | {
      type: 'phase'
      phase: RoundPhase
      roundId: string
      phaseRemainingMs: number
      resultHash: string
      betCount: number
      totalStake: number
    }
  | {
      type: 'bet'
      betCount: number
      totalStake: number
      playerId?: string
      player?: string
      stake?: number
      boostTier?: number
    }
  | { type: 'tick'; multiplier: number; elapsedMs: number }
  | { type: 'level'; levelIndex: number; pointsAwarded: number }
  | {
      type: 'boost'
      levelIndex: number
      /** У кого бустер сработал — у остальных участников его просто не было. */
      fired: { playerId: string; player: string; boostMultiplier: number }[]
    }
  | {
      type: 'cashout'
      playerId: string
      player: string
      multiplier: number
      winAmount: number
      points: number
      auto: boolean
    }
  | {
      type: 'round.finished'
      roundId: string
      crashAt: number
      serverSeed: string
      crashPointRaw: string
      boostLevelIndex: number
      betCount: number
      totalWin: number
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
