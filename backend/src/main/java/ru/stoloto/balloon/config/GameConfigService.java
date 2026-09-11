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
