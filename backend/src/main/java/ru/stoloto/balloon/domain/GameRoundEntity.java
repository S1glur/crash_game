package ru.stoloto.balloon.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Завершённый общий раунд — сам полёт, без участников.
 *
 * Отдельная таблица нужна ровно ради одного: раунды идут непрерывно, и раунд,
 * в котором никто не играл, тоже состоялся. Если бы список строился группировкой
 * ставок, такие раунды исчезли бы из истории, и цикл выглядел бы прерывистым.
 */
@Entity
@Table(name = "game_rounds")
public class GameRoundEntity {

    @Id
    private String roundId;

    private String theme;

    /** Коэффициент, на котором лопнул шар. Общий для всех участников. */
    private double crashAt;

    private int betCount;
    private int totalStake;
    private int totalWin;

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

    protected GameRoundEntity() {
        // для JPA
    }

    public GameRoundEntity(String roundId, String theme, double crashAt, int betCount,
                           int totalStake, int totalWin, String resultHash, long serverSeed,
                           double crashPointRaw, int boostLevelIndex) {
        this.roundId = roundId;
        this.theme = theme;
        this.crashAt = crashAt;
        this.betCount = betCount;
        this.totalStake = totalStake;
        this.totalWin = totalWin;
        this.resultHash = resultHash;
        this.serverSeed = serverSeed;
        this.crashPointRaw = crashPointRaw;
        this.boostLevelIndex = boostLevelIndex;
        this.finishedAt = Instant.now();
    }

    public String getRoundId() { return roundId; }
    public String getTheme() { return theme; }
    public double getCrashAt() { return crashAt; }
    public int getBetCount() { return betCount; }
    public int getTotalStake() { return totalStake; }
    public int getTotalWin() { return totalWin; }
    public String getResultHash() { return resultHash; }
    public long getServerSeed() { return serverSeed; }
    public double getCrashPointRaw() { return crashPointRaw; }
    public int getBoostLevelIndex() { return boostLevelIndex; }
    public Instant getFinishedAt() { return finishedAt; }
}
