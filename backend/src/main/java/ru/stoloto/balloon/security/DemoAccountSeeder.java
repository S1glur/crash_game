package ru.stoloto.balloon.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import ru.stoloto.balloon.domain.PlayerEntity;
import ru.stoloto.balloon.domain.PlayerRepository;
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
import java.util.Locale;

/**
 * Создаёт демо-аккаунты из config/accounts.json при старте.
 *
 * Файл отдельный, а не секция game.json, по одной причине: game.json целиком
 * отдаётся игрокам через GET /api/config (на нём построены пороги уровней и
 * инфографика), и пароль администратора уехал бы вместе с ним.
 *
 * Существующие аккаунты не трогаем — иначе смена пароля в базе откатывалась бы
 * к значению из файла на каждом перезапуске сервера.
 */
@Component
public class DemoAccountSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoAccountSeeder.class);

    private final ObjectMapper mapper = JsonMapper.builder()
            .propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    private final PlayerRepository players;
    private final PasswordEncoder passwordEncoder;

    public DemoAccountSeeder(PlayerRepository players, PasswordEncoder passwordEncoder) {
        this.players = players;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int created = 0;
        for (SeedAccount account : load()) {
            String username = Usernames.normalize(account.username());
            if (!Usernames.isValid(username)) {
                log.warn("Skipping demo account with invalid username: {}", account.username());
                continue;
            }
            if (account.password() == null || account.password().isBlank()) {
                log.warn("Skipping demo account {} without a password", username);
                continue;
            }
            if (players.existsByUsername(username)) {
                continue;
            }

            String displayName = account.displayName() == null || account.displayName().isBlank()
                    ? username : account.displayName();
            players.save(new PlayerEntity(
                    username,
                    passwordEncoder.encode(account.password()),
                    displayName,
                    role(account.role()),
                    Math.max(0, account.balance())));
            created++;
            log.info("Demo account created: {} ({})", username, role(account.role()));
        }

        if (created == 0) {
            log.info("Demo accounts already present, nothing seeded");
        }
    }

    private static String role(String raw) {
        String normalized = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        return PlayerEntity.ROLE_ADMIN.equals(normalized)
                ? PlayerEntity.ROLE_ADMIN : PlayerEntity.ROLE_PLAYER;
    }

    /**
     * Ищет файл рядом с репозиторием, а если игра запущена как одиночный jar из
     * произвольной папки — берёт копию, упакованную внутрь артефакта. Иначе
     * скачавший jar остался бы вообще без аккаунтов и не смог бы войти.
     */
    private List<SeedAccount> load() {
        List<Path> candidates = List.of(
                Paths.get("../config/accounts.json"),
                Paths.get("config/accounts.json"));

        for (Path candidate : candidates) {
            Path absolute = candidate.toAbsolutePath().normalize();
            if (Files.isRegularFile(absolute)) {
                try {
                    log.info("Demo accounts loaded from {}", absolute);
                    return accounts(mapper.readValue(absolute.toFile(), SeedFile.class));
                } catch (RuntimeException e) {
                    log.error("Cannot read {}: {}", absolute, e.getMessage());
                    return List.of();
                }
            }
        }

        try (InputStream packaged = getClass().getResourceAsStream("/defaults/accounts.json")) {
            if (packaged == null) {
                log.warn("No accounts.json found — no demo accounts will be created");
                return List.of();
            }
            return accounts(mapper.readValue(packaged, SeedFile.class));
        } catch (IOException | RuntimeException e) {
            log.error("Cannot read packaged accounts.json: {}", e.getMessage());
            return List.of();
        }
    }

    private static List<SeedAccount> accounts(SeedFile file) {
        return file == null || file.accounts() == null ? List.of() : file.accounts();
    }

    record SeedFile(List<SeedAccount> accounts) {}

    record SeedAccount(String username, String password, String displayName, String role, int balance) {}
}
