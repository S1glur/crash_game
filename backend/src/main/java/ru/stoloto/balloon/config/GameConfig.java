package ru.stoloto.balloon.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

/**
 * Модель файла config/game.json. Единственный источник игровых параметров —
 * менять экономику можно правкой JSON без пересборки (сценарий 5 из ТЗ).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record GameConfig(
        String gameId,
        String gameName,
        String gameType,
        boolean isActive,
        DemoUser demoUser,
        Map<String, Theme> themes,
        CrashModel crashModel,
        Map<String, Double> boostTiers,
        Points points,
        Rewards rewards,
        Upsell upsell,
        Ui ui,
        DevMode devMode
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DemoUser(String id, int startingBalance) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Theme(
            int levelsCount,
            List<Double> levelThresholds,
            List<BetOption> betOptions,
            Map<String, Double> lootProbabilities
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BetOption(String id, int cost, int boostTier) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CrashModel(
            double alpha,
            double maxMultiplier,
            double minCrashMultiplier,
            double multiplierGrowthRate,
            int fps,
            double delta
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Points(int pointsPerLine, int pointsCashoutBonus, int pointsBoostBonus) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Rewards(List<Reward> pool) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Reward(String id, String type, int weight) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Upsell(int minWinAmount, int popupTimeoutSec) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Ui(int resultScreenAutoAdvanceSec, int onboardingHintDurationSec) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DevMode(boolean enabled) {}

    /** Тема по имени; бросает понятную ошибку вместо NPE, если темы нет в конфиге. */
    public Theme theme(String name) {
        Theme theme = themes.get(name);
        if (theme == null) {
            throw new IllegalArgumentException("Unknown theme: " + name);
        }
        return theme;
    }

    /** Значение множителя бустера для выбранного тира (1 = без бустера). */
    public double boostValue(int tier) {
        return boostTiers.getOrDefault("multiplier_tier_" + tier + "_value", 1.0);
    }
}
