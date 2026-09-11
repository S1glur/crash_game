package ru.stoloto.balloon.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;

/**
 * Читает config/game.json и перечитывает его, если файл изменился на диске.
 * Hot-reload нужен для обязательного сценария 5: эксперт правит параметр,
 * запускает новый раунд и сразу видит эффект — без пересборки и рестарта.
 */
@Service
public class GameConfigService {

    private static final Logger log = LoggerFactory.getLogger(GameConfigService.class);

    // Jackson 3: ObjectMapper иммутабелен, настройки задаются билдером.
    private final ObjectMapper mapper = JsonMapper.builder()
            .propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    private final Path configPath;

    private volatile GameConfig cached;
    private volatile long cachedModifiedAt = -1;

    public GameConfigService(@Value("${game.config-path}") String configPath) {
        this.configPath = resolve(configPath);
        log.info("Game config path: {}", this.configPath);
    }

    /**
     * Ищет config/game.json по нескольким адресам, потому что рабочая папка
     * зависит от способа запуска: из backend/ через mvnw, из корня репозитория
     * или из произвольной папки через java -jar. Если файла нет нигде —
     * разворачивает эталон из jar рядом с собой, чтобы игра поднялась в любом
     * случае и при этом осталась редактируемой (иначе hot-reload был бы невозможен).
     */
    private static Path resolve(String configured) {
        List<Path> candidates = List.of(
                Paths.get(configured),
                Paths.get("config/game.json"),
                Paths.get("../config/game.json"));

        for (Path candidate : candidates) {
            Path absolute = candidate.toAbsolutePath().normalize();
            if (Files.isRegularFile(absolute)) {
                return absolute;
            }
        }

        Path target = Paths.get("config/game.json").toAbsolutePath().normalize();
        try (InputStream packaged = GameConfigService.class.getResourceAsStream("/defaults/game.json")) {
            if (packaged == null) {
                throw new IllegalStateException("Default game.json missing from the jar");
            }
            Files.createDirectories(target.getParent());
            Files.copy(packaged, target);
            log.info("Game config not found, unpacked default to {}", target);
            return target;
        } catch (IOException e) {
            throw new IllegalStateException("Cannot unpack default game config to " + target, e);
        }
    }

    /**
     * Актуальная конфигурация. Проверяет mtime файла и перечитывает при изменении.
     * Вызывается на старте каждого раунда, поэтому правка JSON применяется
     * к следующему же раунду.
     */
    public GameConfig get() {
        try {
            long modifiedAt = Files.getLastModifiedTime(configPath).toMillis();
            if (cached == null || modifiedAt != cachedModifiedAt) {
                synchronized (this) {
                    if (cached == null || modifiedAt != cachedModifiedAt) {
                        cached = mapper.readValue(configPath.toFile(), GameConfig.class);
                        cachedModifiedAt = modifiedAt;
                        log.info("Game config (re)loaded from {}", configPath);
                    }
                }
            }
            return cached;
        } catch (IOException | RuntimeException e) {
            if (cached != null) {
                // Файл временно битый (его правят прямо сейчас) — продолжаем на прошлой
                // версии, чтобы не уронить активные раунды.
                log.warn("Failed to reload game config, keeping previous version: {}", e.getMessage());
                return cached;
            }
            throw new IllegalStateException("Cannot read game config at " + configPath, e);
        }
    }

    /**
     * Сохраняет конфигурацию из админки. Записывается ровно тот текст, который
     * прислал клиент (после проверки, что он разбирается и значения допустимы) —
     * так не теряются поля, которых нет в модели, вроде пояснений в dev_mode.
     *
     * Пишем во временный файл и переименовываем: если запись оборвётся на
     * середине, игра продолжит работать со старым конфигом, а не с обрубком.
     */
    public synchronized String save(String rawJson) {
        GameConfig parsed;
        try {
            parsed = mapper.readValue(rawJson, GameConfig.class);
        } catch (RuntimeException e) {
            throw new ConfigValidationException("Не удалось разобрать JSON: " + e.getMessage());
        }
        validate(parsed);

        Path temp = configPath.resolveSibling(configPath.getFileName() + ".tmp");
        try {
            Files.writeString(temp, rawJson);
            Files.move(temp, configPath, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot write game config to " + configPath, e);
        }

        // Сбрасываем кэш принудительно: mtime может совпасть при быстрых правках
        // подряд, и тогда изменения молча не применились бы.
        cachedModifiedAt = -1;
        get();
        log.info("Game config updated via API");
        return rawJson;
    }

    /**
     * Проверка допустимости значений. Нужна не для красоты: админка правит
     * работающую игру, и опечатка в одном поле иначе ломает все последующие
     * раунды — например, нулевой темп роста подвешивает шар навсегда.
     */
    private void validate(GameConfig config) {
        GameConfig.CrashModel model = config.crashModel();
        if (model == null) {
            throw new ConfigValidationException("Отсутствует блок crash_model");
        }
        range("alpha", model.alpha(), 0.01, 1.0);
        range("max_multiplier", model.maxMultiplier(), 1.1, 1000.0);
        range("min_crash_multiplier", model.minCrashMultiplier(), 1.0, model.maxMultiplier());
        range("multiplier_growth_rate", model.multiplierGrowthRate(), 0.01, 5.0);
        // 1.0 = без ускорения. Выше 1.5 полёт разгоняется так, что игрок
        // физически не успевает среагировать.
        range("growth_acceleration_base", model.growthAccelerationBase(), 1.0, 1.5);
        range("delta", model.delta(), 0.02, 1.0);

        if (config.points() == null) {
            throw new ConfigValidationException("Отсутствует блок points");
        }
        notNegative("points_per_line", config.points().pointsPerLine());
        notNegative("points_cashout_bonus", config.points().pointsCashoutBonus());
        notNegative("points_boost_bonus", config.points().pointsBoostBonus());

        if (config.demoUser() != null) {
            notNegative("demo_user.starting_balance", config.demoUser().startingBalance());
        }

        if (config.upsell() != null) {
            notNegative("upsell.min_win_amount", config.upsell().minWinAmount());
            // Ноль означал бы попап, закрывающийся в тот же кадр, в котором открылся.
            range("upsell.popup_timeout_sec", config.upsell().popupTimeoutSec(), 1, 120);
        }

        if (config.boostTiers() != null) {
            config.boostTiers().forEach((key, value) -> {
                if (value == null || value < 1.0 || value > 100.0) {
                    throw new ConfigValidationException(
                            key + ": множитель бустера должен быть от 1 до 100");
                }
            });
        }

        if (config.themes() == null || config.themes().isEmpty()) {
            throw new ConfigValidationException("Не задано ни одной темы");
        }
        config.themes().forEach(this::validateTheme);
    }

    private void validateTheme(String name, GameConfig.Theme theme) {
        List<Double> thresholds = theme.levelThresholds();
        if (thresholds == null || thresholds.isEmpty()) {
            throw new ConfigValidationException(name + ": не заданы пороги уровней");
        }
        if (thresholds.size() != theme.levelsCount()) {
            throw new ConfigValidationException(name + ": levels_count (" + theme.levelsCount()
                    + ") не совпадает с числом порогов (" + thresholds.size() + ")");
        }
        if (thresholds.getFirst() <= 1.0) {
            throw new ConfigValidationException(name + ": первый порог должен быть больше 1.0");
        }
        for (int i = 1; i < thresholds.size(); i++) {
            if (thresholds.get(i) <= thresholds.get(i - 1)) {
                throw new ConfigValidationException(name + ": пороги уровней должны строго расти, "
                        + "нарушено на уровне " + (i + 1));
            }
        }

        if (theme.betOptions() == null || theme.betOptions().isEmpty()) {
            throw new ConfigValidationException(name + ": не заданы варианты ставок");
        }
        for (GameConfig.BetOption option : theme.betOptions()) {
            if (option.cost() <= 0) {
                throw new ConfigValidationException(
                        name + "/" + option.id() + ": стоимость ставки должна быть больше нуля");
            }
        }

        if (theme.lootProbabilities() != null) {
            double sum = 0;
            for (var entry : theme.lootProbabilities().entrySet()) {
                if (entry.getValue() == null || entry.getValue() < 0) {
                    throw new ConfigValidationException(
                            name + "/" + entry.getKey() + ": вероятность не может быть отрицательной");
                }
                sum += entry.getValue();
            }
            if (sum <= 0) {
                throw new ConfigValidationException(
                        name + ": сумма вероятностей бустера равна нулю — бустер никогда не появится");
            }
        }
    }

    private static void range(String field, double value, double min, double max) {
        if (Double.isNaN(value) || value < min || value > max) {
            throw new ConfigValidationException(
                    "%s: допустимо от %s до %s, получено %s".formatted(field, min, max, value));
        }
    }

    private static void notNegative(String field, int value) {
        if (value < 0) {
            throw new ConfigValidationException(field + ": значение не может быть отрицательным");
        }
    }

    /** Ошибка валидации конфигурации — превращается в 400 с кодом VALIDATION_ERROR. */
    public static class ConfigValidationException extends RuntimeException {
        public ConfigValidationException(String message) {
            super(message);
        }
    }

    /** Сырой JSON — для GET /api/config (админка). */
    public String rawJson() {
        try {
            return Files.readString(configPath);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read game config at " + configPath, e);
        }
    }

    public Path path() {
        return configPath;
    }
}
