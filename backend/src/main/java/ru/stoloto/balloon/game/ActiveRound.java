package ru.stoloto.balloon.game;

import ru.stoloto.balloon.config.GameConfig;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Состояние летящего раунда. Живёт в памяти, пока шар не лопнет.
 *
 * Ключевое разделение (см. docs/math-model.md):
 *  - base multiplier   — прогресс полёта, по нему считаются уровни и момент краха;
 *  - effective         — base * boostFactor, то, что видит игрок и по чему считается выигрыш.
 */
public class ActiveRound {

    private final String roundId;
    private final String theme;
    private final int bet;
    private final int boostTier;
    private final double speedFactor;
    private final RoundOutcome outcome;
    private final List<Double> thresholds;
    private final GameConfig.Points pointsConfig;
    private final double growthRate;
    private final double accelBase;
    private final long startedAtNanos;

    /** Сколько уровней уже пересечено — чтобы не слать событие дважды. */
    private volatile int levelsCrossed = 0;
    private volatile double boostFactor = 1.0;
    private volatile boolean boostApplied = false;
    private volatile int points = 0;

    private volatile Double autoCashoutAt = null;
    private volatile Double cashedOutAt = null;
    private volatile int winAmount = 0;
    private final AtomicBoolean finished = new AtomicBoolean(false);

    public ActiveRound(String roundId, String theme, int bet, int boostTier, double speedFactor,
                       RoundOutcome outcome, GameConfig config) {
        this.roundId = roundId;
        this.theme = theme;
        this.bet = bet;
        this.boostTier = boostTier;
        this.speedFactor = speedFactor;
        this.outcome = outcome;
        this.thresholds = config.theme(theme).levelThresholds();
        this.pointsConfig = config.points();
        this.growthRate = config.crashModel().multiplierGrowthRate();
        this.accelBase = config.crashModel().growthAccelerationBase();
        this.startedAtNanos = System.nanoTime();
    }

    /**
     * Базовый коэффициент на текущий момент.
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
    public double baseMultiplier() {
        double elapsedSeconds = (System.nanoTime() - startedAtNanos) / 1_000_000_000.0;
        double scaledTime = elapsedSeconds * speedFactor;

        if (accelBase <= 1.0 + 1e-9) {
            return Math.exp(growthRate * scaledTime);
        }
        double lnBase = Math.log(accelBase);
        return Math.exp(growthRate * (Math.pow(accelBase, scaledTime) - 1.0) / lnBase);
    }

    /** Коэффициент, который видит игрок: базовый с учётом сработавшего бустера. */
    public double effectiveMultiplier() {
        return baseMultiplier() * boostFactor;
    }

    public boolean hasCrashed() {
        return baseMultiplier() >= outcome.crashPoint();
    }

    /** Засчитывает переход на уровень, возвращает количество начисленных очков. */
    public int crossLevel() {
        levelsCrossed++;
        points += pointsConfig.pointsPerLine();
        return pointsConfig.pointsPerLine();
    }

    /** Применяет бустер; после cashout не вызывается (бустер уже не действует). */
    public int applyBoost(double boostValue) {
        boostFactor = boostValue;
        boostApplied = true;
        points += pointsConfig.pointsBoostBonus();
        return pointsConfig.pointsBoostBonus();
    }

    /**
     * Порог автовывода, заданный игроком до старта (null — автовывод выключен).
     * Хранится и проверяется на сервере: если бы им занимался клиент, вывод
     * зависел бы от лагов вкладки и не сработал бы на свёрнутой странице.
     */
    public Double autoCashoutAt() {
        return autoCashoutAt;
    }

    public void setAutoCashoutAt(Double target) {
        this.autoCashoutAt = target;
    }

    /** Пора ли сработать автовыводу на текущем коэффициенте. */
    public boolean autoCashoutDue() {
        return autoCashoutAt != null
                && !isCashedOut()
                && !finished.get()
                && levelsCrossed >= 1
                && effectiveMultiplier() >= autoCashoutAt;
    }

    /** Фиксирует выигрыш. Возвращает false, если cashout уже был или раунд завершён. */
    public synchronized boolean cashout() {
        if (cashedOutAt != null || finished.get()) {
            return false;
        }
        double multiplier = effectiveMultiplier();
        cashedOutAt = multiplier;
        winAmount = (int) Math.floor(bet * multiplier);
        points += pointsConfig.pointsCashoutBonus();
        return true;
    }

    public boolean markFinished() {
        return finished.compareAndSet(false, true);
    }

    /** Порог следующего ещё не пересечённого уровня, или null если все пройдены. */
    public Double nextThreshold() {
        return levelsCrossed < thresholds.size() ? thresholds.get(levelsCrossed) : null;
    }

    public String roundId() { return roundId; }
    public String theme() { return theme; }
    public int bet() { return bet; }
    public int boostTier() { return boostTier; }
    public RoundOutcome outcome() { return outcome; }
    public int levelsCrossed() { return levelsCrossed; }
    public int points() { return points; }
    public boolean boostApplied() { return boostApplied; }
    public double boostFactor() { return boostFactor; }
    public Double cashedOutAt() { return cashedOutAt; }
    public int winAmount() { return winAmount; }
    public boolean isCashedOut() { return cashedOutAt != null; }
    public boolean isFinished() { return finished.get(); }
    public long elapsedMillis() { return (System.nanoTime() - startedAtNanos) / 1_000_000; }
    public List<Double> thresholds() { return thresholds; }
}
