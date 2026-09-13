package ru.stoloto.balloon.game;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import ru.stoloto.balloon.api.ApiException;
import ru.stoloto.balloon.config.GameConfig;
import ru.stoloto.balloon.config.GameConfigService;
import ru.stoloto.balloon.domain.PlayerEntity;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Непрерывный цикл раундов: приём ставок -> полёт -> показ итога -> снова приём.
 *
 * Раунды идут сами по себе, даже когда в игре никого нет. Это меняет две вещи
 * по сравнению с прежней схемой «у каждого свой шар»:
 *
 * 1. Исход раунда разыгрывается при СОЗДАНИИ раунда, то есть до того, как
 *    принята первая ставка. Provably-fair от этого только крепче: хеш
 *    опубликован раньше, чем кто-либо решил играть.
 * 2. Коэффициент на экране один на всех. Бустер поэтому умножает не его, а
 *    личную выплату участника — иначе общий раунд показывал бы разным людям
 *    разные числа.
 *
 * У каждой темы свой цикл: у зелёной 9 уровней, у красной 12, и общая лестница
 * на всех сделала бы выбор темы бессмысленным.
 *
 * Вся случайность и все расчёты — здесь, на сервере (требование честности ТЗ).
 */
@Service
public class RoundService {

    private static final Logger log = LoggerFactory.getLogger(RoundService.class);

    /** Лента завершённых раундов всех участников — общая на всех. */
    public static final String FEED_TOPIC = "/topic/feed";

    private final GameConfigService configService;
    private final SimpMessagingTemplate messaging;
    private final RoundPersistence persistence;
    private final LeaderboardService leaderboard;

    /** Текущий раунд каждой темы. Пустым не бывает: цикл крутится всегда. */
    private final Map<String, SharedRound> rounds = new ConcurrentHashMap<>();

    /**
     * Ставки, сделанные не вовремя — во время полёта или показа итога. Они ждут
     * открытия следующего приёма ставок. Без этого одинокий игрок, зашедший
     * посреди полёта, вынужден был бы сидеть и караулить нужную секунду.
     */
    private final Map<String, Map<String, Bet>> pending = new ConcurrentHashMap<>();

    /** Seed для следующего раунда темы, если его задали через dev-эндпоинт. */
    private final Map<String, Long> forcedSeeds = new ConcurrentHashMap<>();

    private final AtomicLong roundCounter = new AtomicLong();
    private final Random rewardRandom = new Random();

    private ScheduledExecutorService scheduler;

    public RoundService(GameConfigService configService,
                        SimpMessagingTemplate messaging,
                        RoundPersistence persistence,
                        LeaderboardService leaderboard) {
        this.configService = configService;
        this.messaging = messaging;
        this.persistence = persistence;
        this.leaderboard = leaderboard;
    }

    @PostConstruct
    void startLoop() {
        GameConfig config = configService.get();

        /*
          Продолжаем нумерацию с того места, где её оставил прошлый запуск.
          Идентификатор раунда — первичный ключ таблицы полётов, и счётчик,
          начинающийся с нуля, затирал прежние раунды один за другим: полёт
          терял участников и выплаты, а ставки оставались в своей таблице.
          Отчётность после каждого перезапуска показывала приход без выплат,
          то есть растущую из ниоткуда прибыль.
        */
        long continueFrom = persistence.maxRoundNumber();
        roundCounter.set(continueFrom);
        if (continueFrom > 0) {
            log.info("Round numbering continues from r-{}", continueFrom);
        }

        for (String theme : config.themes().keySet()) {
            pending.put(theme, new ConcurrentHashMap<>());
            rounds.put(theme, newRound(theme, config));
        }

        long periodMillis = Math.max(16, (long) (config.crashModel().delta() * 1000));
        scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "round-loop");
            thread.setDaemon(true);
            return thread;
        });
        scheduler.scheduleAtFixedRate(this::tickAll, periodMillis, periodMillis, TimeUnit.MILLISECONDS);
        log.info("Round cycle started for themes {}, tick period {} ms", rounds.keySet(), periodMillis);
    }

    @PreDestroy
    void stopLoop() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }

    // --- Приём ставок ---

    /**
     * Принимает ставку игрока. Если приём уже закрыт, ставка встаёт в очередь на
     * следующий раунд этой темы — баланс списывается сразу в обоих случаях,
     * чтобы нельзя было занять место в раунде, не имея денег.
     *
     * @return раунд, в который ставка попала, либо null если она в очереди
     */
    public SharedRound placeBet(PlayerEntity player, String theme, int stake,
                                String boostOptionId, Double autoCashoutAt) {
        GameConfig config = configService.get();

        GameConfig.Theme themeConfig;
        try {
            themeConfig = config.theme(theme);
        } catch (IllegalArgumentException e) {
            throw new ApiException("VALIDATION_ERROR", "Неизвестная тема: " + theme);
        }

        GameConfig.BoostOption option = config.boostOption(boostOptionId);
        if (option == null) {
            throw new ApiException("INVALID_BET_OPTION",
                    "Неизвестный вариант бустера: " + boostOptionId);
        }

        // Границы ставки проверяем на сервере: клиент может прислать что угодно,
        // а ставка в 0 баллов или в миллион ломает и экономику, и вёрстку.
        GameConfig.Stake limits = config.stake();
        if (stake < limits.min() || stake > limits.max()) {
            throw new ApiException("VALIDATION_ERROR",
                    "Ставка возможна от %d до %d баллов".formatted(limits.min(), limits.max()));
        }
        if (limits.step() > 0 && (stake - limits.min()) % limits.step() != 0) {
            throw new ApiException("VALIDATION_ERROR",
                    "Ставка задаётся с шагом %d баллов".formatted(limits.step()));
        }

        // Порог автовывода ниже первого уровня недостижим: «Забрать» до него
        // не работает по правилам игры, и автовывод молча никогда бы не сработал.
        double firstLevel = themeConfig.levelThresholds().getFirst();
        if (autoCashoutAt != null
                && (autoCashoutAt < firstLevel || autoCashoutAt > config.crashModel().maxMultiplier())) {
            throw new ApiException("VALIDATION_ERROR",
                    "Автовывод возможен от %.2f до %.0f".formatted(
                            firstLevel, config.crashModel().maxMultiplier()));
        }

        SharedRound round = round(theme);
        if (pending(theme).containsKey(player.getId())) {
            throw new ApiException("BET_ALREADY_PLACED", "Ставка на следующий раунд уже сделана");
        }
        /*
          Ставка в текущем раунде — дубль только пока идёт приём. В полёте и в
          показе итога round(theme) это раунд, который игрок уже отыграл: его
          ставка там ничего не говорит о следующем. Сравнивая с ней, мы
          запирали участника раунда ровно на то время, когда он и хочет
          поставить снова, — а очередь на следующий раунд сделана как раз
          для этого случая.
        */
        if (round.phase() == RoundPhase.BETTING && round.bet(player.getId()) != null) {
            throw new ApiException("BET_ALREADY_PLACED", "Ставка на этот раунд уже сделана");
        }

        int boostFee = config.boostFee(option, stake);
        int totalPaid = stake + boostFee;
        if (player.getBalance() < totalPaid) {
            throw new ApiException("INSUFFICIENT_BALANCE", "Не хватает бонусов");
        }
        persistence.chargeBet(player.getId(), totalPaid);

        Bet bet = new Bet(player.getId(), player.getDisplayName(), stake, boostFee,
                option.boostTier(), config.boostValue(option.boostTier()),
                autoCashoutAt, config.points());

        if (round.phase() == RoundPhase.BETTING) {
            round.addBet(bet);
            broadcastBet(round, bet);
            log.debug("Bet accepted: round={} player={} stake={} fee={} tier={}",
                    round.roundId(), player.getUsername(), stake, boostFee, option.boostTier());
            return round;
        }

        pending(theme).put(player.getId(), bet);
        log.debug("Bet queued for next round: theme={} player={} stake={}",
                theme, player.getUsername(), stake);
        return null;
    }

    /** Отмена ставки до взлёта — с возвратом всей списанной суммы. */
    public void cancelBet(String playerId, String theme) {
        Bet queued = pending(theme).remove(playerId);
        if (queued != null) {
            persistence.refundBet(playerId, queued.totalPaid());
            return;
        }

        SharedRound round = round(theme);
        if (round.phase() != RoundPhase.BETTING) {
            throw new ApiException("ROUND_NOT_ACTIVE", "Приём ставок уже закрыт");
        }
        Bet bet = round.removeBet(playerId);
        if (bet == null) {
            throw new ApiException("BET_NOT_FOUND", "Ставка не найдена");
        }
        persistence.refundBet(playerId, bet.totalPaid());
        broadcastBet(round, null);
    }

    /**
     * Фиксация выигрыша. Коэффициент берётся с сервера по времени взлёта —
     * клиентское значение не принимается, иначе результат можно было бы подделать.
     */
    public Bet cashout(String playerId, String theme) {
        SharedRound round = round(theme);
        if (round.phase() != RoundPhase.FLYING) {
            throw new ApiException("ROUND_NOT_ACTIVE", "Шар не в полёте");
        }
        Bet bet = round.bet(playerId);
        if (bet == null) {
            throw new ApiException("BET_NOT_FOUND", "В этом раунде у вас нет ставки");
        }
        if (bet.isCashedOut()) {
            throw new ApiException("ALREADY_CASHED_OUT", "Выигрыш уже зафиксирован");
        }
        if (round.levelsCrossed() < 1) {
            throw new ApiException("ROUND_NOT_ACTIVE", "Забрать можно только после первого уровня");
        }
        if (!applyCashout(round, bet, false)) {
            throw new ApiException("ROUND_NOT_ACTIVE", "Раунд уже завершён");
        }
        return bet;
    }

    /**
     * Фиксация выигрыша и зачисление на баланс. Общая точка для ручного
     * «Забрать» и автовывода — иначе два пути расходятся, и какой-нибудь из них
     * однажды забудет начислить очки или разослать событие.
     */
    private boolean applyCashout(SharedRound round, Bet bet, boolean auto) {
        if (!bet.cashout(round.multiplier())) {
            return false;
        }

        persistence.creditWin(bet.playerId(), bet.winAmount());

        send(topic(round.theme()), Map.of(
                "type", "cashout",
                "playerId", bet.playerId(),
                "player", bet.playerName(),
                "multiplier", round2(bet.cashedOutAt()),
                "winAmount", bet.winAmount(),
                "points", bet.points(),
                "auto", auto));

        // Бонус за вывод — тоже очки, таблица должна о нём узнать.
        publishLeaderboard();

        log.debug("Cashout{} round={} player={} at={} win={}",
                auto ? " (auto)" : "", round.roundId(), bet.playerName(),
                bet.cashedOutAt(), bet.winAmount());
        return true;
    }

    // --- Игровой цикл ---

    private void tickAll() {
        for (SharedRound round : rounds.values()) {
            try {
                tick(round);
            } catch (Exception e) {
                log.error("Tick failed for round {}", round.roundId(), e);
            }
        }
    }

    private void tick(SharedRound round) {
        switch (round.phase()) {
            case BETTING -> {
                if (round.phaseExpired()) {
                    takeOff(round);
                }
            }
            case FLYING -> fly(round);
            case RESULT -> {
                if (round.phaseExpired()) {
                    openNextRound(round.theme());
                }
            }
        }
    }

    private void takeOff(SharedRound round) {
        GameConfig config = configService.get();
        round.startFlying(resultMillis(config));
        send(topic(round.theme()), phaseEvent(round));
        log.debug("Round {} took off with {} bets", round.roundId(), round.betCount());
    }

    private void fly(SharedRound round) {
        String topic = topic(round.theme());

        // 1. Пересечённые уровни (за один тик их может быть больше одного).
        boolean pointsChanged = false;
        Double next;
        while ((next = round.nextThreshold()) != null && round.multiplier() >= next) {
            int levelIndex = round.levelsCrossed();
            int awarded = round.crossLevel();
            pointsChanged |= awarded > 0;
            send(topic, Map.of(
                    "type", "level",
                    "levelIndex", levelIndex,
                    "pointsAwarded", awarded));

            /*
              2. Бустер на этом уровне. Уровень общий, а множитель — свой у
              каждого участника по купленному тиру. Решение принимает сам
              applyBoost под своим замком: проверять «не забрал ли игрок
              выигрыш» здесь нельзя, между проверкой и применением успевает
              вклиниться cashout, и бустер не попал бы в выплату.
            */
            if (levelIndex == round.outcome().boostLevelIndex()) {
                List<Map<String, Object>> fired = new ArrayList<>();
                for (Bet bet : round.bets()) {
                    if (bet.applyBoost()) {
                        pointsChanged = true;
                        fired.add(Map.of(
                                "playerId", bet.playerId(),
                                "player", bet.playerName(),
                                "boostMultiplier", bet.boostValue()));
                    }
                }
                send(topic, Map.of(
                        "type", "boost",
                        "levelIndex", levelIndex,
                        "fired", fired));
            }
        }

        // Очки выросли — значит кто-то мог сдвинуться в турнирной таблице.
        // Рассылаем сразу: ТЗ требует, чтобы позиция менялась во время полёта,
        // а не после краха.
        if (pointsChanged) {
            publishLeaderboard();
        }

        // 3. Автовывод — проверяем до краха: если игрок выставил порог и шар его
        // достиг, выигрыш должен быть зафиксирован, даже когда крах случается
        // в этом же тике.
        double multiplier = round.multiplier();
        for (Bet bet : round.bets()) {
            if (bet.autoCashoutDue(multiplier, round.levelsCrossed())) {
                applyCashout(round, bet, true);
            }
        }

        // 4. Крах.
        if (round.hasCrashed()) {
            settle(round);
            return;
        }

        // 5. Обычный тик коэффициента.
        send(topic, Map.of(
                "type", "tick",
                "multiplier", round2(multiplier),
                "elapsedMs", round.elapsedMillis()));
    }

    private void settle(SharedRound round) {
        GameConfig config = configService.get();
        double crashAt = round2(round.outcome().crashPoint());

        // Награда выдаётся каждому участнику — и выигравшему, и проигравшему.
        for (Bet bet : round.bets()) {
            bet.setReward(pickReward(config));
        }

        round.finish();
        persistence.saveRound(round, crashAt);

        send(topic(round.theme()), Map.of(
                "type", "round.finished",
                "roundId", round.roundId(),
                "crashAt", crashAt,
                "serverSeed", String.valueOf(round.outcome().serverSeed()),
                "crashPointRaw", String.format(Locale.ROOT, "%.6f", round.outcome().crashPoint()),
                "boostLevelIndex", round.outcome().boostLevelIndex(),
                "betCount", round.betCount(),
                "totalWin", round.totalWin()));

        /*
          Общая лента: завершённый раунд виден всем, кто сейчас в игре, — у них
          история на экране обновляется без перезагрузки страницы.
        */
        for (Bet bet : round.bets()) {
            messaging.convertAndSend(FEED_TOPIC, (Object) Map.of(
                    "roundId", round.roundId(),
                    "player", bet.playerName(),
                    "theme", round.theme(),
                    "stake", bet.stake(),
                    "outcome", bet.outcome(),
                    "multiplier", bet.isCashedOut() ? round2(bet.cashedOutAt()) : crashAt,
                    "winAmount", bet.winAmount(),
                    "points", bet.points()));
        }

        // Очки раунда осели в аккаунтах — пересобираем таблицу уже без них в полёте.
        publishLeaderboard();

        log.debug("Round {} crashed at {} with {} bets, paid out {}",
                round.roundId(), crashAt, round.betCount(), round.totalWin());
    }

    /** Открывает новый раунд темы и переносит в него ставки из очереди. */
    private void openNextRound(String theme) {
        GameConfig config = configService.get();
        SharedRound round = newRound(theme, config);
        rounds.put(theme, round);

        Map<String, Bet> queued = pending(theme);
        for (Bet bet : List.copyOf(queued.values())) {
            queued.remove(bet.playerId());
            round.addBet(bet);
        }

        send(topic(theme), phaseEvent(round));
        if (round.betCount() > 0) {
            log.debug("Round {} opened with {} queued bets", round.roundId(), round.betCount());
        }
    }

    private SharedRound newRound(String theme, GameConfig config) {
        Long seed = forcedSeeds.remove(theme);
        /*
          boostTier = 2 передаём только чтобы уровень с бустером вообще
          разыгрался: раунд общий, а тиры у участников разные, и позиция уровня
          от них не зависит (её задаёт line_N_loot_prob, как требует сценарий 4).
        */
        RoundOutcome outcome = RoundOutcome.generate(config, theme, 2, seed);
        long bettingEndsAt = System.currentTimeMillis() + bettingMillis(config);
        return new SharedRound("r-" + roundCounter.incrementAndGet(), theme, outcome, config,
                speedFactor(config), bettingEndsAt);
    }

    /** Награда выдаётся всегда — и при выигрыше, и при проигрыше (требование ТЗ). */
    private GameConfig.Reward pickReward(GameConfig config) {
        var pool = config.rewards().pool();
        int total = pool.stream().mapToInt(GameConfig.Reward::weight).sum();
        if (total <= 0) {
            return pool.getFirst();
        }
        int roll = rewardRandom.nextInt(total);
        int acc = 0;
        for (GameConfig.Reward reward : pool) {
            acc += reward.weight();
            if (roll < acc) {
                return reward;
            }
        }
        return pool.getLast();
    }

    // --- Доступ снаружи ---

    public SharedRound round(String theme) {
        SharedRound round = rounds.get(theme);
        if (round == null) {
            throw new ApiException("VALIDATION_ERROR", "Неизвестная тема: " + theme);
        }
        return round;
    }

    public Map<String, SharedRound> allRounds() {
        return rounds;
    }

    /** Ставка игрока в очереди на следующий раунд темы, если она есть. */
    public Bet queuedBet(String theme, String playerId) {
        return pending(theme).get(playerId);
    }

    /** Задаёт seed следующего раунда темы — для воспроизводимой проверки сценариев. */
    public void forceSeed(String theme, long seed) {
        forcedSeeds.put(theme, seed);
    }

    /**
     * Очки незавершённых раундов по игрокам — вторая половина живого рейтинга.
     * Накопленные очки лежат в аккаунте, а эти существуют только в памяти, пока
     * шар в воздухе.
     */
    public Map<String, Integer> inFlightPoints() {
        Map<String, Integer> points = new HashMap<>();
        for (SharedRound round : rounds.values()) {
            if (round.phase() == RoundPhase.RESULT) {
                continue;
            }
            for (Bet bet : round.bets()) {
                points.merge(bet.playerId(), bet.points(), Integer::sum);
            }
        }
        return points;
    }

    // --- Вспомогательное ---

    private Map<String, Bet> pending(String theme) {
        return pending.computeIfAbsent(theme, key -> new ConcurrentHashMap<>());
    }

    private void publishLeaderboard() {
        leaderboard.broadcast(inFlightPoints());
    }

    private void broadcastBet(SharedRound round, Bet bet) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", "bet");
        event.put("betCount", round.betCount());
        event.put("totalStake", round.totalStake());
        if (bet != null) {
            event.put("playerId", bet.playerId());
            event.put("player", bet.playerName());
            event.put("stake", bet.stake());
            event.put("boostTier", bet.boostTier());
        }
        send(topic(round.theme()), event);
    }

    /** Смена фазы — по этому событию клиент переключает экран. */
    private Map<String, Object> phaseEvent(SharedRound round) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", "phase");
        event.put("phase", round.phase().name());
        event.put("roundId", round.roundId());
        event.put("phaseRemainingMs", round.phaseRemainingMillis());
        event.put("resultHash", round.outcome().hash());
        event.put("betCount", round.betCount());
        event.put("totalStake", round.totalStake());
        return event;
    }

    private static String topic(String theme) {
        return "/topic/round/" + theme;
    }

    private long bettingMillis(GameConfig config) {
        int seconds = config.roundCycle() == null ? 15 : config.roundCycle().bettingSeconds();
        return Math.max(1, seconds) * 1000L;
    }

    private long resultMillis(GameConfig config) {
        int seconds = config.roundCycle() == null ? 6 : config.roundCycle().resultSeconds();
        return Math.max(1, seconds) * 1000L;
    }

    /**
     * Ускорение полёта. Живёт в конфиге, а не в запросе: раунд теперь общий, и
     * один игрок не может разгонять шар для всех остальных.
     */
    private double speedFactor(GameConfig config) {
        if (config.devMode() == null || !config.devMode().enabled() || config.roundCycle() == null) {
            return 1.0;
        }
        double factor = config.roundCycle().speedFactor();
        return factor > 0 ? factor : 1.0;
    }

    /**
     * Отправка события в топик темы. Явное приведение к Object снимает
     * неоднозначность перегрузок convertAndSend: с Map-аргументом компилятор
     * не может выбрать между (destination, payload) и (payload, headers).
     */
    private void send(String topic, Map<String, Object> payload) {
        messaging.convertAndSend(topic, (Object) payload);
    }

    /** Коэффициенты отдаём клиенту с двумя знаками — как договорились в контракте. */
    public static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
