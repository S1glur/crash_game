package ru.stoloto.balloon.game;

import ru.stoloto.balloon.config.GameConfig;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.SplittableRandom;
import java.util.random.RandomGenerator;

/**
 * Предрассчитанный исход раунда: точка краха и позиция бустера.
 * Вычисляется ДО начала полёта и не меняется — клиент не может на него повлиять
 * (требование честности, п. 2.3 ТЗ). До завершения раунда наружу отдаётся
 * только hash(), сам serverSeed раскрывается после краха.
 *
 * @param crashPoint      базовый коэффициент, на котором шар лопнет (без учёта бустера)
 * @param boostLevelIndex индекс уровня с бустером, или -1 если бустера в раунде нет
 * @param serverSeed      seed, по которому воспроизводится раунд
 */
public record RoundOutcome(double crashPoint, int boostLevelIndex, long serverSeed) {

    /**
     * Точка краха: crash = alpha / (1 - U), U ~ Uniform(0,1), с отсечением по границам.
     * Модель и смысл параметров описаны в docs/math-model.md.
     */
    public static RoundOutcome generate(GameConfig config, String theme, int boostTier, Long fixedSeed) {
        long seed = fixedSeed != null ? fixedSeed : new java.security.SecureRandom().nextLong();

        // SplittableRandom, а не java.util.Random. У Random линейный конгруэнтный
        // генератор плохо перемешивает малые seed: для 1, 2, 3, 7, 42 первый
        // nextDouble() лежит в диапазоне 0.722–0.732, то есть все dev-раунды
        // получали практически одну и ту же точку краха (~3.6) и режим
        // воспроизводимости не давал ничего, кроме иллюзии. SplitMix64 внутри
        // SplittableRandom перемешивает seed полноценно.
        RandomGenerator random = new SplittableRandom(seed);

        GameConfig.CrashModel model = config.crashModel();
        double u = random.nextDouble();
        double crashPoint = Math.clamp(
                model.alpha() / (1.0 - u),
                model.minCrashMultiplier(),
                model.maxMultiplier());

        int boostLevelIndex = boostTier > 1
                ? pickBoostLevel(config.theme(theme), random)
                : -1;

        return new RoundOutcome(crashPoint, boostLevelIndex, seed);
    }

    /**
     * Взвешенный выбор одного уровня по line_N_loot_prob текущей темы.
     * Сумма вероятностей в конфиге равна 1, но нормализуем на случай правки руками.
     */
    private static int pickBoostLevel(GameConfig.Theme theme, RandomGenerator random) {
        int levels = theme.levelsCount();
        double total = 0;
        double[] weights = new double[levels];
        for (int i = 0; i < levels; i++) {
            weights[i] = theme.lootProbabilities().getOrDefault("line_" + (i + 1) + "_loot_prob", 0.0);
            total += weights[i];
        }
        if (total <= 0) {
            return random.nextInt(levels);
        }
        double roll = random.nextDouble() * total;
        double acc = 0;
        for (int i = 0; i < levels; i++) {
            acc += weights[i];
            if (roll < acc) {
                return i;
            }
        }
        return levels - 1;
    }

    /**
     * SHA-256(crashPoint|boostLevelIndex|serverSeed) — публикуется ДО полёта.
     * После раунда игрок получает serverSeed и может пересчитать хеш сам,
     * убедившись, что исход не подменили задним числом.
     */
    public String hash() {
        // Locale.ROOT обязателен: иначе на русской локали %.6f даст "3,560000",
        // и хеш зависел бы от настроек машины, на которой запущен сервер.
        String payload = String.format(Locale.ROOT, "%.6f|%d|%d",
                crashPoint, boostLevelIndex, serverSeed);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** Сколько уровней успеет пересечь шар до краха — для отладки и симуляции. */
    public int levelsReached(List<Double> thresholds) {
        int count = 0;
        for (double threshold : thresholds) {
            if (crashPoint >= threshold) {
                count++;
            }
        }
        return count;
    }
}
