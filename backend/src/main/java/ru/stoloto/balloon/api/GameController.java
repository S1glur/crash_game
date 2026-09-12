package ru.stoloto.balloon.api;

import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Limit;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ru.stoloto.balloon.config.GameConfig;
import ru.stoloto.balloon.config.GameConfigService;
import ru.stoloto.balloon.domain.GameRoundEntity;
import ru.stoloto.balloon.domain.GameRoundRepository;
import ru.stoloto.balloon.domain.PlayerEntity;
import ru.stoloto.balloon.domain.PlayerRepository;
import ru.stoloto.balloon.domain.RoundEntity;
import ru.stoloto.balloon.domain.RoundRepository;
import ru.stoloto.balloon.game.Bet;
import ru.stoloto.balloon.game.LeaderboardService;
import ru.stoloto.balloon.game.RoundPersistence;
import ru.stoloto.balloon.game.RoundService;
import ru.stoloto.balloon.game.SharedRound;
import ru.stoloto.balloon.security.CurrentPlayer;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** REST-часть контракта из docs/api.md. Все операции идут от имени вошедшего игрока. */
@RestController
@RequestMapping("/api")
public class GameController {

    private final RoundService roundService;
    private final RoundPersistence persistence;
    private final GameConfigService configService;
    private final RoundRepository roundRepository;
    private final GameRoundRepository gameRoundRepository;
    private final PlayerRepository playerRepository;
    private final CurrentPlayer currentPlayer;
    private final LeaderboardService leaderboardService;
    private final Path rulesPath;

    public GameController(RoundService roundService,
                          RoundPersistence persistence,
                          GameConfigService configService,
                          RoundRepository roundRepository,
                          GameRoundRepository gameRoundRepository,
                          PlayerRepository playerRepository,
                          CurrentPlayer currentPlayer,
                          LeaderboardService leaderboardService,
                          @Value("${game.rules-path}") String rulesPath) {
        this.roundService = roundService;
        this.persistence = persistence;
        this.configService = configService;
        this.roundRepository = roundRepository;
        this.gameRoundRepository = gameRoundRepository;
        this.playerRepository = playerRepository;
        this.currentPlayer = currentPlayer;
        this.leaderboardService = leaderboardService;
        this.rulesPath = Paths.get(rulesPath).toAbsolutePath().normalize();
    }

    /**
     * Стартовое состояние при загрузке фронта. Отвечает 401, если сессии нет —
     * по этому ответу фронт понимает, что нужно показать экран входа.
     *
     * Отдаёт текущий раунд КАЖДОЙ темы: цикл идёт непрерывно, и клиент должен
     * увидеть фазу и обратный отсчёт сразу, не дожидаясь первого WS-события.
     */
    @GetMapping("/state")
    public Map<String, Object> state() {
        PlayerEntity player = currentPlayer.require();
        GameConfig config = configService.get();

        Map<String, Object> levelsCount = new LinkedHashMap<>();
        config.themes().forEach((name, theme) -> levelsCount.put(name, theme.levelsCount()));

        /*
          Варианты бустера отдаём вместе с priceFactor, а не с готовой ценой:
          цена зависит от суммы ставки, которую игрок ещё не выбрал. Клиент
          считает её для подсказки, но окончательное слово за сервером — он
          пересчитывает доплату при приёме ставки.
        */
        List<Map<String, Object>> boostOptions = config.boostOptions().stream()
                .map(option -> Map.<String, Object>of(
                        "id", option.id(),
                        "boostTier", option.boostTier(),
                        "priceFactor", option.priceFactor(),
                        "boostMultiplier", config.boostValue(option.boostTier())))
                .toList();

        GameConfig.Stake limits = config.stake();
        Map<String, Object> stake = new LinkedHashMap<>();
        stake.put("min", limits.min());
        stake.put("max", limits.max());
        stake.put("step", limits.step());
        stake.put("presets", limits.presets());

        Map<String, Object> rounds = new LinkedHashMap<>();
        roundService.allRounds().forEach((name, round) ->
                rounds.put(name, roundView(round, player.getId())));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("user", userView(player));
        body.put("balance", player.getBalance());
        body.put("theme", config.themes().containsKey("green") ? "green" : config.themes().keySet().iterator().next());
        body.put("rounds", rounds);
        body.put("stake", stake);
        body.put("boostOptions", boostOptions);
        body.put("levelsCount", levelsCount);
        return body;
    }

    /**
     * Правила игры — обязательный отдельный доступ до подтверждения ставки.
     * Текст читается из docs/rules.md, чтобы не держать две копии формулировок;
     * при запуске из произвольной папки (java -jar) файла рядом нет, тогда
     * берём копию, упакованную в jar.
     */
    @GetMapping("/rules")
    public Map<String, String> rules() throws IOException {
        if (Files.isRegularFile(rulesPath)) {
            return Map.of("content", Files.readString(rulesPath, StandardCharsets.UTF_8));
        }
        try (var packaged = getClass().getResourceAsStream("/defaults/rules.md")) {
            if (packaged == null) {
                throw new IOException("Rules text not found at " + rulesPath + " nor in the jar");
            }
            return Map.of("content", new String(packaged.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    /**
     * История ставок всех участников прототипа — этого требует сценарий 1.
     * Имя игрока идёт вместе со ставкой: без него в общей истории не отличить
     * свой полёт от чужого.
     */
    @GetMapping("/history")
    public Map<String, Object> history(@RequestParam(defaultValue = "20") int limit) {
        currentPlayer.require();
        Map<String, String> names = playerNames();

        List<Map<String, Object>> items = new ArrayList<>();
        for (RoundEntity entity : roundRepository.findAllByOrderByFinishedAtDesc(Limit.of(limit))) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("roundId", entity.getRoundId());
            item.put("playerId", entity.getPlayerId());
            item.put("player", names.getOrDefault(entity.getPlayerId(), "—"));
            item.put("theme", entity.getTheme());
            item.put("stake", entity.getStake());
            item.put("totalPaid", entity.getTotalPaid());
            item.put("result", entity.getOutcome());
            item.put("multiplier", entity.getOutcome().equals("cashout")
                    ? entity.getCashedOutAt() : entity.getCrashAt());
            item.put("winAmount", entity.getWinAmount());
            item.put("points", entity.getPoints());
            item.put("finishedAt", entity.getFinishedAt().toString());
            items.add(item);
        }
        return Map.of("items", items);
    }

    /**
     * Недавние раунды — кто сколько поставил и сколько забрал.
     *
     * Список строится по таблице самих раундов, а не группировкой ставок:
     * раунды идут непрерывно, и раунд, в котором никто не играл, тоже
     * состоялся. Иначе цикл выглядел бы прерывистым.
     */
    @GetMapping("/rounds/recent")
    public Map<String, Object> recentRounds(@RequestParam(defaultValue = "20") int limit,
                                            @RequestParam(required = false) String theme) {
        currentPlayer.require();

        List<GameRoundEntity> rounds = theme == null || theme.isBlank()
                ? gameRoundRepository.findAllByOrderByFinishedAtDesc(Limit.of(limit))
                : gameRoundRepository.findAllByThemeOrderByFinishedAtDesc(theme, Limit.of(limit));

        Map<String, List<RoundEntity>> betsByRound = new HashMap<>();
        List<String> ids = rounds.stream().map(GameRoundEntity::getRoundId).toList();
        if (!ids.isEmpty()) {
            for (RoundEntity bet : roundRepository.findAllByRoundIdIn(ids)) {
                betsByRound.computeIfAbsent(bet.getRoundId(), key -> new ArrayList<>()).add(bet);
            }
        }

        Map<String, String> names = playerNames();
        List<Map<String, Object>> items = new ArrayList<>();
        for (GameRoundEntity round : rounds) {
            List<Map<String, Object>> participants = new ArrayList<>();
            for (RoundEntity bet : betsByRound.getOrDefault(round.getRoundId(), List.of())) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("playerId", bet.getPlayerId());
                row.put("player", names.getOrDefault(bet.getPlayerId(), "—"));
                row.put("stake", bet.getStake());
                row.put("boostFee", bet.getBoostFee());
                row.put("totalPaid", bet.getTotalPaid());
                row.put("boostTier", bet.getBoostTier());
                row.put("boostApplied", bet.isBoostApplied());
                row.put("outcome", bet.getOutcome());
                row.put("cashedOutAt", bet.getCashedOutAt());
                row.put("winAmount", bet.getWinAmount());
                row.put("points", bet.getPoints());
                participants.add(row);
            }
            participants.sort((a, b) -> Integer.compare(
                    (int) b.get("winAmount"), (int) a.get("winAmount")));

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("roundId", round.getRoundId());
            item.put("theme", round.getTheme());
            item.put("crashAt", round.getCrashAt());
            item.put("betCount", round.getBetCount());
            item.put("totalStake", round.getTotalStake());
            item.put("totalWin", round.getTotalWin());
            item.put("boostLevelIndex", round.getBoostLevelIndex());
            item.put("resultHash", round.getResultHash());
            item.put("serverSeed", String.valueOf(round.getServerSeed()));
            item.put("crashPointRaw", String.format(Locale.ROOT, "%.6f", round.getCrashPointRaw()));
            item.put("finishedAt", round.getFinishedAt().toString());
            item.put("participants", participants);
            items.add(item);
        }
        return Map.of("items", items);
    }

    /**
     * Пополнение баланса до стартового значения из конфига.
     *
     * ТЗ: «демо-пользователь с ненулевым балансом ИЛИ сценарий его пополнения» —
     * эксперт должен пройти все сценарии сам. Проиграв баланс до суммы меньше
     * минимальной ставки, он без этого упирается в тупик, из которого выводит
     * только перезапуск сервера.
     */
    @PostMapping("/demo/topup")
    public Map<String, Object> topUp() {
        PlayerEntity player = currentPlayer.require();
        int credited = persistence.topUpToStart(player.getId());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("credited", credited);
        body.put("balance", persistence.player(player.getId()).getBalance());
        return body;
    }

    /**
     * Приём ставки в текущий раунд темы. Если приём уже закрыт, ставка встаёт
     * в очередь на следующий раунд — тогда в ответе queued = true.
     */
    @PostMapping("/round/bet")
    public Map<String, Object> placeBet(@RequestBody BetRequest request) {
        PlayerEntity player = currentPlayer.require();
        SharedRound joined = roundService.placeBet(player, request.theme(), request.stake(),
                request.boostOptionId(), request.autoCashoutAt());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("queued", joined == null);
        body.put("theme", request.theme());
        body.put("roundId", joined == null ? null : joined.roundId());
        body.put("balanceAfter", persistence.player(player.getId()).getBalance());
        body.put("round", roundView(roundService.round(request.theme()), player.getId()));
        return body;
    }

    /** Отмена ставки до взлёта — с возвратом всей списанной суммы. */
    @PostMapping("/round/{theme}/cancel")
    public Map<String, Object> cancelBet(@PathVariable String theme) {
        PlayerEntity player = currentPlayer.require();
        roundService.cancelBet(player.getId(), theme);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("balanceAfter", persistence.player(player.getId()).getBalance());
        body.put("round", roundView(roundService.round(theme), player.getId()));
        return body;
    }

    /** Фиксация выигрыша по текущему серверному коэффициенту. */
    @PostMapping("/round/{theme}/cashout")
    public Map<String, Object> cashout(@PathVariable String theme) {
        PlayerEntity player = currentPlayer.require();
        Bet bet = roundService.cashout(player.getId(), theme);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("roundId", roundService.round(theme).roundId());
        body.put("cashedOutAt", RoundService.round2(bet.cashedOutAt()));
        body.put("winAmount", bet.winAmount());
        body.put("pointsSoFar", bet.points());
        body.put("balance", persistence.player(player.getId()).getBalance());
        return body;
    }

    /** Личный итог завершённого раунда — экран результата берёт данные отсюда. */
    @GetMapping("/round/{roundId}")
    public Map<String, Object> roundResult(@PathVariable String roundId) {
        PlayerEntity player = currentPlayer.require();
        RoundEntity entity = roundRepository.findById(roundId + ":" + player.getId())
                .orElseThrow(() -> new ApiException("ROUND_NOT_ACTIVE",
                        "В раунде " + roundId + " у вас не было ставки"));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("roundId", entity.getRoundId());
        body.put("theme", entity.getTheme());
        body.put("stake", entity.getStake());
        body.put("boostFee", entity.getBoostFee());
        body.put("totalPaid", entity.getTotalPaid());
        body.put("outcome", entity.getOutcome());
        body.put("cashedOutAt", entity.getCashedOutAt());
        body.put("crashAt", entity.getCrashAt());
        body.put("winAmount", entity.getWinAmount());
        body.put("points", entity.getPoints());
        body.put("reward", Map.of("type", entity.getRewardType(), "id", entity.getRewardId()));
        body.put("balance", persistence.player(player.getId()).getBalance());

        // Provably fair: всё, что нужно игроку, чтобы пересчитать resultHash самому.
        // Строка для проверки: sha256(crashPointRaw|boostLevelIndex|serverSeed).
        body.put("resultHash", entity.getResultHash());
        body.put("serverSeed", String.valueOf(entity.getServerSeed()));
        body.put("crashPointRaw", String.format(Locale.ROOT, "%.6f", entity.getCrashPointRaw()));
        body.put("boostLevelIndex", entity.getBoostLevelIndex());
        return body;
    }

    /**
     * Турнирная таблица: первый снимок при загрузке страницы. Дальше она
     * приходит сама по /topic/leaderboard, без опроса сервера.
     */
    @GetMapping("/leaderboard")
    public Map<String, Object> leaderboard() {
        currentPlayer.require();
        return Map.of("rows", leaderboardService.rows(roundService.inFlightPoints()));
    }

    /** Текущая конфигурация — для админки и инфографики на экране ставки. */
    @GetMapping(value = "/config", produces = "application/json")
    public String config() {
        return configService.rawJson();
    }

    /**
     * Сохранение конфигурации из админки: валидация значений и запись в файл.
     * Применяется со следующего раунда — так эксперт меняет экономику игры,
     * не трогая ни код, ни файлы на диске (обязательный сценарий 5).
     *
     * Доступ только у роли ADMIN — правило задано в SecurityConfig.
     */
    @PutMapping(value = "/config", consumes = "application/json", produces = "application/json")
    public String updateConfig(@RequestBody String rawJson) {
        return configService.save(rawJson);
    }

    private Map<String, String> playerNames() {
        Map<String, String> names = new HashMap<>();
        playerRepository.findAll().forEach(player -> names.put(player.getId(), player.getDisplayName()));
        return names;
    }

    private static Map<String, Object> userView(PlayerEntity player) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", player.getId());
        view.put("username", player.getUsername());
        view.put("displayName", player.getDisplayName());
        view.put("role", player.getRole());
        view.put("balance", player.getBalance());
        view.put("totalPoints", player.getTotalPoints());
        return view;
    }

    /**
     * Снимок текущего раунда темы. Того же набора полей хватает и для первой
     * загрузки, и для восстановления экрана после F5 — клиент собирает картинку
     * целиком, а не по кускам из последующих событий.
     */
    private Map<String, Object> roundView(SharedRound round, String playerId) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("roundId", round.roundId());
        view.put("theme", round.theme());
        view.put("phase", round.phase().name());
        view.put("phaseRemainingMs", round.phaseRemainingMillis());
        view.put("levelsCount", round.thresholds().size());
        view.put("levelThresholds", round.thresholds());
        // Позиция бустера раскрывается сразу: ТЗ описывает механику «ждать уровня
        // с бустером, рискуя крахом», а ждать невидимый маркер игрок не может.
        // Точку краха это не раскрывает — она в hash и остаётся на сервере.
        view.put("boostLevelIndex", round.outcome().boostLevelIndex());
        view.put("resultHash", round.outcome().hash());
        view.put("multiplier", RoundService.round2(round.multiplier()));
        view.put("levelsCrossed", round.levelsCrossed());
        view.put("elapsedMs", round.elapsedMillis());
        view.put("betCount", round.betCount());
        view.put("totalStake", round.totalStake());
        view.put("bets", round.bets().stream().map(GameController::betView).toList());

        Bet mine = round.bet(playerId);
        Bet queued = roundService.queuedBet(round.theme(), playerId);
        view.put("myBet", mine == null ? null : betView(mine));
        view.put("queuedBet", queued == null ? null : betView(queued));
        return view;
    }

    private static Map<String, Object> betView(Bet bet) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("playerId", bet.playerId());
        view.put("player", bet.playerName());
        view.put("stake", bet.stake());
        view.put("boostFee", bet.boostFee());
        view.put("totalPaid", bet.totalPaid());
        view.put("boostTier", bet.boostTier());
        view.put("boostMultiplier", bet.boostValue());
        view.put("boostApplied", bet.boostApplied());
        view.put("autoCashoutAt", bet.autoCashoutAt());
        view.put("cashedOutAt", bet.cashedOutAt() == null ? null : RoundService.round2(bet.cashedOutAt()));
        view.put("winAmount", bet.winAmount());
        view.put("points", bet.points());
        return view;
    }

    /**
     * Тело POST /api/round/bet.
     *
     * Полей seed и speedFactor здесь больше нет: раунд общий, и один игрок не
     * может ни задать исход, ни разогнать шар для всех остальных. Ускорение
     * живёт в конфиге (round_cycle.speed_factor), а воспроизводимый seed
     * задаётся админским POST /api/dev/seed.
     */
    public record BetRequest(
            @NotBlank String theme,
            /** Сумма ставки в баллах — свободная, в границах config.stake. */
            int stake,
            @NotBlank String boostOptionId,
            /** Коэффициент, на котором сервер сам зафиксирует выигрыш. null — выключено. */
            Double autoCashoutAt
    ) {}
}
