package ru.stoloto.balloon.api;

import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Limit;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ru.stoloto.balloon.config.GameConfig;
import ru.stoloto.balloon.config.GameConfigService;
import ru.stoloto.balloon.domain.RoundEntity;
import ru.stoloto.balloon.domain.RoundRepository;
import ru.stoloto.balloon.game.ActiveRound;
import ru.stoloto.balloon.game.RoundPersistence;
import ru.stoloto.balloon.game.RoundService;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** REST-часть контракта из docs/api.md. */
@RestController
@RequestMapping("/api")
public class GameController {

    private final RoundService roundService;
    private final RoundPersistence persistence;
    private final GameConfigService configService;
    private final RoundRepository roundRepository;
    private final Path rulesPath;

    public GameController(RoundService roundService,
                          RoundPersistence persistence,
                          GameConfigService configService,
                          RoundRepository roundRepository,
                          @Value("${game.rules-path}") String rulesPath) {
        this.roundService = roundService;
        this.persistence = persistence;
        this.configService = configService;
        this.roundRepository = roundRepository;
        this.rulesPath = Paths.get(rulesPath).toAbsolutePath().normalize();
    }

    /** Стартовое состояние при загрузке фронта. */
    @GetMapping("/state")
    public Map<String, Object> state() {
        GameConfig config = configService.get();

        Map<String, Object> betOptions = new LinkedHashMap<>();
        Map<String, Object> levelsCount = new LinkedHashMap<>();
        config.themes().forEach((name, theme) -> {
            betOptions.put(name, theme.betOptions().stream()
                    .map(option -> Map.<String, Object>of(
                            "id", option.id(),
                            "cost", option.cost(),
                            "boostMultiplier", config.boostValue(option.boostTier())))
                    .toList());
            levelsCount.put(name, theme.levelsCount());
        });

        ActiveRound active = roundService.currentActive();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("balance", persistence.player().getBalance());
        body.put("theme", config.themes().containsKey("green") ? "green" : config.themes().keySet().iterator().next());
        body.put("activeRound", active == null ? null : activeRoundView(active));
        body.put("betOptions", betOptions);
        body.put("levelsCount", levelsCount);
        return body;
    }

    /**
     * Правила игры — обязательный отдельный доступ до подтверждения ставки.
     * Текст читается из docs/rules.md, чтобы не держать две копии формулировок.
     */
    @GetMapping("/rules")
    public Map<String, String> rules() throws IOException {
        return Map.of("content", Files.readString(rulesPath, StandardCharsets.UTF_8));
    }

    /** История завершённых раундов всех пользователей прототипа. */
    @GetMapping("/history")
    public Map<String, Object> history(@RequestParam(defaultValue = "20") int limit) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (RoundEntity entity : roundRepository.findAllByOrderByFinishedAtDesc(Limit.of(limit))) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("roundId", entity.getRoundId());
            item.put("theme", entity.getTheme());
            item.put("bet", entity.getBet());
            item.put("result", entity.getOutcome());
            item.put("multiplier", entity.getOutcome().equals("cashout")
                    ? entity.getCashedOutAt() : entity.getCrashAt());
            item.put("points", entity.getPoints());
            item.put("finishedAt", entity.getFinishedAt().toString());
            items.add(item);
        }
        return Map.of("items", items);
    }

    /** Старт раунда: списывает ставку, отдаёт id раунда и provably-fair хеш. */
    @PostMapping("/round/start")
    public Map<String, Object> startRound(@RequestBody StartRequest request) {
        ActiveRound round = roundService.start(
                request.theme(), request.betOptionId(), request.seed(), request.speedFactor());

        GameConfig config = configService.get();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("roundId", round.roundId());
        body.put("theme", round.theme());
        body.put("bet", round.bet());
        body.put("boostMultiplier", config.boostValue(round.boostTier()));
        body.put("levelsCount", round.thresholds().size());
        body.put("levelThresholds", round.thresholds());
        // Позиция бустера раскрывается сразу: ТЗ описывает механику «ждать уровня с
        // бустером, рискуя крахом», а ждать невидимый маркер игрок не может.
        // Точку краха это не раскрывает — она в hash и остаётся на сервере.
        body.put("boostLevelIndex", round.outcome().boostLevelIndex());
        body.put("resultHash", round.outcome().hash());
        body.put("balanceAfter", persistence.player().getBalance());
        return body;
    }

    /** Фиксация выигрыша по текущему серверному коэффициенту. */
    @PostMapping("/round/{roundId}/cashout")
    public Map<String, Object> cashout(@PathVariable String roundId) {
        ActiveRound round = roundService.cashout(roundId);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("roundId", round.roundId());
        body.put("cashedOutAt", RoundService.round2(round.cashedOutAt()));
        body.put("winAmount", round.winAmount());
        body.put("pointsSoFar", round.points());
        return body;
    }

    /** Итог завершённого раунда — экран результата берёт данные отсюда. */
    @GetMapping("/round/{roundId}")
    public Map<String, Object> roundResult(@PathVariable String roundId) {
        RoundEntity entity = roundRepository.findById(roundId)
                .orElseThrow(() -> new ApiException("ROUND_NOT_ACTIVE", "Раунд не найден: " + roundId));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("roundId", entity.getRoundId());
        body.put("theme", entity.getTheme());
        body.put("bet", entity.getBet());
        body.put("outcome", entity.getOutcome());
        body.put("cashedOutAt", entity.getCashedOutAt());
        body.put("crashAt", entity.getCrashAt());
        body.put("winAmount", entity.getWinAmount());
        body.put("points", entity.getPoints());
        body.put("reward", Map.of("type", entity.getRewardType(), "id", entity.getRewardId()));
        body.put("balance", persistence.player().getBalance());

        // Provably fair: всё, что нужно игроку, чтобы пересчитать resultHash самому.
        // Строка для проверки: sha256(crashPointRaw|boostLevelIndex|serverSeed).
        body.put("resultHash", entity.getResultHash());
        body.put("serverSeed", String.valueOf(entity.getServerSeed()));
        body.put("crashPointRaw", String.format(java.util.Locale.ROOT, "%.6f", entity.getCrashPointRaw()));
        body.put("boostLevelIndex", entity.getBoostLevelIndex());
        return body;
    }

    /** Текущая конфигурация — для админки. */
    @GetMapping(value = "/config", produces = "application/json")
    public String config() {
        return configService.rawJson();
    }

    /**
     * Состояние летящего раунда — тот же набор полей, что отдаёт /round/start,
     * чтобы после перезагрузки страницы фронт мог восстановить экран полёта
     * целиком, а не частично.
     */
    private Map<String, Object> activeRoundView(ActiveRound round) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("roundId", round.roundId());
        view.put("theme", round.theme());
        view.put("bet", round.bet());
        view.put("boostMultiplier", configService.get().boostValue(round.boostTier()));
        view.put("levelsCount", round.thresholds().size());
        view.put("levelThresholds", round.thresholds());
        view.put("boostLevelIndex", round.outcome().boostLevelIndex());
        view.put("resultHash", round.outcome().hash());
        view.put("multiplier", RoundService.round2(round.effectiveMultiplier()));
        view.put("levelsCrossed", round.levelsCrossed());
        view.put("boostApplied", round.boostApplied());
        view.put("points", round.points());
        view.put("elapsedMs", round.elapsedMillis());
        view.put("cashedOutAt", round.cashedOutAt());
        view.put("winAmount", round.winAmount());
        return view;
    }

    /** Тело POST /api/round/start. Поля seed и speedFactor действуют только в dev-режиме. */
    public record StartRequest(
            @NotBlank String theme,
            @NotBlank String betOptionId,
            Long seed,
            Double speedFactor
    ) {}
}
