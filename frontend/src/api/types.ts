/**
 * Типы ответов бэкенда. Сверено с живым API, а не только с docs/api.md:
 * GET /api/round/{id} отдаёт больше полей, чем описано в контракте
 * (balance, crashPointRaw, boostLevelIndex) — они нужны для проверки честности.
 */

export type Theme = 'green' | 'red'
export type Outcome = 'cashout' | 'crash'

export interface BetOption {
  id: string
  cost: number
  boostMultiplier: number
}

export interface ActiveRoundView {
  roundId: string
  theme: Theme
  bet: number
  levelThresholds: number[]
  multiplier: number
  levelsCrossed: number
  cashedOutAt: number | null
}

export interface GameState {
  balance: number
  theme: Theme
  activeRound: ActiveRoundView | null
  betOptions: Record<Theme, BetOption[]>
  levelsCount: Record<Theme, number>
}

export interface StartedRound {
  roundId: string
  theme: Theme
  bet: number
  boostMultiplier: number
  levelsCount: number
  levelThresholds: number[]
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
  bet: number
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
  theme: Theme
  bet: number
  result: Outcome
  multiplier: number
  points: number
  finishedAt: string
}

/** Срез config/game.json — фронту нужны только эти ветки. */
export interface GameConfig {
  themes: Record<
    Theme,
    {
      levels_count: number
      level_thresholds: number[]
      bet_options: { id: string; cost: number; boost_tier: number }[]
      loot_probabilities: Record<string, number>
    }
  >
  crash_model: {
    alpha: number
    max_multiplier: number
    min_crash_multiplier: number
    multiplier_growth_rate: number
    fps: number
    delta: number
  }
  boost_tiers: Record<string, number>
  points: {
    points_per_line: number
    points_cashout_bonus: number
    points_boost_bonus: number
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

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
