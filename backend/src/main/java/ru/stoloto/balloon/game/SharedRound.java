package ru.stoloto.balloon.game;

import ru.stoloto.balloon.config.GameConfig;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Общий раунд одной темы: один шар, одна точка краха, сколько угодно участников.
 *
 * Раунд существует всегда, даже когда в нём никто не играет — цикл крутится
 * сервером непрерывно. Исход (точка краха и уровень с бустером) разыгрывается
 * в момент создания раунда, то есть ДО того, как принята первая ставка. Это
 * усиливает provably-fair: хеш опубликован раньше, чем кто-либо решил играть.
 *
 * Уровень с бустером один на раунд (его позицию задаёт line_N_loot_prob, как
 * требует сценарий 4), а множитель — свой у каждого участника по купленному тиру.
 */
public class SharedRound {

    private final String roundId;
    private final String theme;
    private final RoundOutcome outcome;
    private final List<Double> thresholds;
    private final GameConfig.Points pointsConfig;
    private final double growthRate;
    private final double accelBase;
    private final double speedFactor;

    private final Map<String, Bet> bets = new ConcurrentHashMap<>();

    private volatile RoundPhase phase = RoundPhase.BETTING;
    private volatile long phaseEndsAtMillis;
    /** Момент взлёта. До перехода в FLYING равен нулю — коэффициент держим на 1. */
    private volatile long flyingStartedNanos = 0;
    private volatile int levelsCrossed = 0;
    private volatile double crashAt = 0;
    /** Сколько держать фазу итога — запоминаем при взлёте, чтобы не тянуть конфиг в finish(). */
    private volatile long resultPhaseMillis = 0;

    public SharedRound(String roundId, String theme, RoundOutcome outcome, GameConfig config,
                       double speedFactor, long bettingEndsAtMillis) {
        this.roundId = roundId;
        this.theme = theme;
        this.outcome = outcome;
        this.thresholds = config.theme(theme).levelThresholds();
        this.pointsConfig = config.points();
        this.growthRate = config.crashModel().multiplierGrowthRate();
        this.accelBase = config.crashModel().growthAccelerationBase();
        this.speedFactor = speedFactor;
        this.phaseEndsAtMillis = bettingEndsAtMillis;
    }

    /**
     * Базовый коэффициент на текущий момент — общий для всех участников.
     *
     * Скорость роста сама растёт со временем: r(t) = growthRate * accelBase^t.
     * Интеграл по времени даёт множитель
     *
     *     m(t) = exp( growthRate * (accelBase^t - 1) / ln(accelBase) )
     *
     * Зачем так: при постоянной скорости раунд с самого начала идёт в темпе,
     * в котором успеть нажать «Забрать» осознанно почти невозможно, а редкие
     * долгие полёты, наоборот, тянутся бесконечно. Ускорение решает обе
     * проблемы сразу — в начале есть время на решение, а к концу полёт
     * разгоняется, и высокие коэффициенты не превращаются в ожидание.
     *
     * accelBase = 1.0 означает отсутствие ускорения: тогда формула вырождается
     * в обычную экспоненту, и этот случай надо считать отдельно, иначе деление
     * на ln(1) = 0 даст бесконечность.
     */
    public double multiplier() {
        if (phase == RoundPhase.BETTING || flyingStartedNanos == 0) {
            return 1.0;
        }
        if (phase == RoundPhase.RESULT) {
            return crashAt;
        }
        double elapsedSeconds = (System.nanoTime() - flyingStartedNanos) / 1_000_000_000.0;
        double scaledTime = elapsedSeconds * speedFactor;

        if (accelBase <= 1.0 + 1e-9) {
            return Math.exp(growthRate * scaledTime);
        }
        double lnBase = Math.log(accelBase);
        return Math.exp(growthRate * (Math.pow(accelBase, scaledTime) - 1.0) / lnBase);
    }

    public boolean hasCrashed() {
        return multiplier() >= outcome.crashPoint();
    }

    public void startFlying(long resultPhaseMillis) {
        this.flyingStartedNanos = System.nanoTime();
        this.phase = RoundPhase.FLYING;
        this.phaseEndsAtMillis = 0;
        this.resultPhaseMillis = resultPhaseMillis;
    }

    public void finish() {
        this.crashAt = outcome.crashPoint();
        this.phase = RoundPhase.RESULT;
        this.phaseEndsAtMillis = System.currentTimeMillis() + resultPhaseMillis;
    }

    /** Засчитывает переход на уровень и раздаёт очки тем, кто ещё в воздухе. */
    public synchronized int crossLevel() {
        levelsCrossed++;
        int awarded = 0;
        for (Bet bet : bets.values()) {
            awarded += bet.awardLevel();
        }
        return awarded;
    }

    /** Порог следующего ещё не пересечённого уровня, или null если все пройдены. */
    public Double nextThreshold() {
        return levelsCrossed < thresholds.size() ? thresholds.get(levelsCrossed) : null;
    }

    public void addBet(Bet bet) {
        bets.put(bet.playerId(), bet);
    }

    public Bet removeBet(String playerId) {
        return bets.remove(playerId);
    }

    public Bet bet(String playerId) {
        return bets.get(playerId);
    }

    public Collection<Bet> bets() {
        return bets.values();
    }

    public int betCount() {
        return bets.size();
    }

    public int totalStake() {
        return bets.values().stream().mapToInt(Bet::totalPaid).sum();
    }

    public int totalWin() {
        return bets.values().stream().mapToInt(Bet::winAmount).sum();
    }

    /** Сколько миллисекунд осталось до конца текущей фазы (0 — фаза без таймера). */
    public long phaseRemainingMillis() {
        return phaseEndsAtMillis == 0 ? 0 : Math.max(0, phaseEndsAtMillis - System.currentTimeMillis());
    }

    public boolean phaseExpired() {
        return phaseEndsAtMillis != 0 && System.currentTimeMillis() >= phaseEndsAtMillis;
    }

    public String roundId() { return roundId; }
    public String theme() { return theme; }
    public RoundPhase phase() { return phase; }
    public RoundOutcome outcome() { return outcome; }
    public List<Double> thresholds() { return thresholds; }
    public int levelsCrossed() { return levelsCrossed; }
    public double crashAt() { return crashAt; }
    public long elapsedMillis() {
        return flyingStartedNanos == 0 ? 0 : (System.nanoTime() - flyingStartedNanos) / 1_000_000;
    }
}
