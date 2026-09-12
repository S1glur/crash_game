package ru.stoloto.balloon.game;

import ru.stoloto.balloon.config.GameConfig;

/**
 * Ставка одного игрока в общем раунде.
 *
 * Раньше ставка и раунд были одним объектом: у каждого игрока был свой шар со
 * своей точкой краха. Теперь шар один на всех, и здесь живёт только то, что
 * различается между участниками — сумма, бустер, момент выхода и выигрыш.
 *
 * Строго разделены ставка и доплата за бустер: выигрыш считается только от
 * ставки, доплата сгорает всегда (разбор в docs/math-model.md, раздел
 * «Почему бустер не может быть честным»).
 */
public class Bet {

    private final String playerId;
    private final String playerName;
    private final int stake;
    private final int boostFee;
    private final int boostTier;
    /** Множитель бустера, зафиксированный в момент ставки. */
    private final double boostValue;
    private final GameConfig.Points pointsConfig;

    private volatile Double autoCashoutAt;
    private volatile boolean boostApplied = false;
    private volatile Double cashedOutAt = null;
    private volatile int winAmount = 0;
    private volatile int points = 0;
    private volatile String rewardId;
    private volatile String rewardType;

    public Bet(String playerId, String playerName, int stake, int boostFee, int boostTier,
               double boostValue, Double autoCashoutAt, GameConfig.Points pointsConfig) {
        this.playerId = playerId;
        this.playerName = playerName;
        this.stake = stake;
        this.boostFee = boostFee;
        this.boostTier = boostTier;
        this.boostValue = boostValue;
        this.autoCashoutAt = autoCashoutAt;
        this.pointsConfig = pointsConfig;
    }

    /**
     * Личный множитель к общему коэффициенту. Число на экране одно на всех —
     * это прогресс полёта; бустер умножает не его, а выплату конкретного игрока,
     * иначе общий раунд показывал бы разным людям разные числа.
     */
    public double boostFactor() {
        return boostApplied ? boostValue : 1.0;
    }

    /** Сколько игрок получит, если заберёт прямо сейчас при данном коэффициенте. */
    public int winAt(double baseMultiplier) {
        return (int) Math.floor(stake * baseMultiplier * boostFactor());
    }

    /**
     * Очки за пройденный уровень. Начисляются только пока ставка в воздухе:
     * иначе можно было бы забрать на первом уровне минимальной суммой и
     * собирать очки за всю оставшуюся высоту, ничем не рискуя.
     */
    public synchronized int awardLevel() {
        if (cashedOutAt != null) {
            return 0;
        }
        points += pointsConfig.pointsPerLine();
        return pointsConfig.pointsPerLine();
    }

    /**
     * Применяет бустер. Возвращает false, если применять уже нечего.
     *
     * Проверка обязана быть внутри замка вместе с самим применением. Иначе
     * поток игрового цикла успевает убедиться, что cashout ещё не случился,
     * и уже после этого REST-поток фиксирует выигрыш по boostFactor = 1.0 —
     * на экране бустер вспыхивает, а в выплату не попадает.
     */
    public synchronized boolean applyBoost() {
        if (boostTier <= 1 || boostApplied || cashedOutAt != null) {
            return false;
        }
        boostApplied = true;
        points += pointsConfig.pointsBoostBonus();
        return true;
    }

    /** Фиксирует выигрыш по текущему коэффициенту. false — забирать уже поздно или нечего. */
    public synchronized boolean cashout(double baseMultiplier) {
        if (cashedOutAt != null) {
            return false;
        }
        cashedOutAt = baseMultiplier * boostFactor();
        winAmount = (int) Math.floor(stake * cashedOutAt);
        points += pointsConfig.pointsCashoutBonus();
        return true;
    }

    /** Пора ли сработать автовыводу на текущем коэффициенте. */
    public boolean autoCashoutDue(double baseMultiplier, int levelsCrossed) {
        return autoCashoutAt != null
                && cashedOutAt == null
                && levelsCrossed >= 1
                && baseMultiplier * boostFactor() >= autoCashoutAt;
    }

    public void setReward(GameConfig.Reward reward) {
        this.rewardId = reward.id();
        this.rewardType = reward.type();
    }

    public String playerId() { return playerId; }
    public String playerName() { return playerName; }
    public int stake() { return stake; }
    public int boostFee() { return boostFee; }
    /** Сколько списано с баланса всего: ставка плюс доплата за бустер. */
    public int totalPaid() { return stake + boostFee; }
    public int boostTier() { return boostTier; }
    public double boostValue() { return boostValue; }
    public boolean boostApplied() { return boostApplied; }
    public Double autoCashoutAt() { return autoCashoutAt; }
    public Double cashedOutAt() { return cashedOutAt; }
    public boolean isCashedOut() { return cashedOutAt != null; }
    public int winAmount() { return winAmount; }
    public int points() { return points; }
    public String rewardId() { return rewardId; }
    public String rewardType() { return rewardType; }
    public String outcome() { return cashedOutAt != null ? "cashout" : "crash"; }
}
