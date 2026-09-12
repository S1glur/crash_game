package ru.stoloto.balloon.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Ставка одного игрока в завершённом раунде — строка общей истории игр
 * (обязательный пункт сценария 1).
 *
 * Раунд теперь общий, поэтому строк с одним roundId столько, сколько было
 * участников. Ключ составной (roundId:playerId): по нему запись находится
 * без лишнего индекса, а сам roundId остаётся обычной колонкой, по которой
 * собирается список участников раунда.
 */
@Entity
@Table(name = "rounds")
public class RoundEntity {

    @Id
    private String id;

    /** Общий раунд, в котором сделана ставка. Одинаков у всех его участников. */
    @Column(nullable = false)
    private String roundId;

    /** Владелец раунда. Без него история общая и обезличенная. */
    @Column(nullable = false)
    private String playerId;

    private String theme;

    /** Ставка — только от неё считается выигрыш. */
    private int stake;

    /** Доплата за бустер: сгорает всегда, в выплате не участвует. */
    private int boostFee;

    /** "cashout" или "crash". */
    private String outcome;

    private Double cashedOutAt;
    private double crashAt;
    private int winAmount;
    private int points;
    private int boostTier;
    private boolean boostApplied;

    private String rewardId;
    private String rewardType;

    @Column(length = 64)
    private String resultHash;
    private long serverSeed;

    /**
     * Сырые значения, от которых считался resultHash. Без них игрок не может
     * пересчитать хеш и проверить честность: crashAt округлён до 2 знаков,
     * а позиция бустера иначе вообще не раскрывается.
     */
    private double crashPointRaw;
    private int boostLevelIndex;

    private Instant finishedAt;

    protected RoundEntity() {
        // для JPA
    }

    public RoundEntity(String roundId, String playerId, String theme, int stake, int boostFee,
                       String outcome, Double cashedOutAt, double crashAt, int winAmount, int points,
                       int boostTier, boolean boostApplied, String rewardId, String rewardType,
                       String resultHash, long serverSeed, double crashPointRaw, int boostLevelIndex) {
        this.id = roundId + ":" + playerId;
        this.roundId = roundId;
        this.playerId = playerId;
        this.theme = theme;
        this.stake = stake;
        this.boostFee = boostFee;
        this.outcome = outcome;
        this.cashedOutAt = cashedOutAt;
        this.crashAt = crashAt;
        this.winAmount = winAmount;
        this.points = points;
        this.boostTier = boostTier;
        this.boostApplied = boostApplied;
        this.rewardId = rewardId;
        this.rewardType = rewardType;
        this.resultHash = resultHash;
        this.serverSeed = serverSeed;
        this.crashPointRaw = crashPointRaw;
        this.boostLevelIndex = boostLevelIndex;
        this.finishedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getRoundId() { return roundId; }
    public String getPlayerId() { return playerId; }
    public String getTheme() { return theme; }
    public int getStake() { return stake; }
    public int getBoostFee() { return boostFee; }
    public int getTotalPaid() { return stake + boostFee; }
    public String getOutcome() { return outcome; }
    public Double getCashedOutAt() { return cashedOutAt; }
    public double getCrashAt() { return crashAt; }
    public int getWinAmount() { return winAmount; }
    public int getPoints() { return points; }
    public int getBoostTier() { return boostTier; }
    public boolean isBoostApplied() { return boostApplied; }
    public String getRewardId() { return rewardId; }
    public String getRewardType() { return rewardType; }
    public String getResultHash() { return resultHash; }
    public long getServerSeed() { return serverSeed; }
    public double getCrashPointRaw() { return crashPointRaw; }
    public int getBoostLevelIndex() { return boostLevelIndex; }
    public Instant getFinishedAt() { return finishedAt; }
}
