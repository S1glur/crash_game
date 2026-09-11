package ru.stoloto.balloon.game;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.stoloto.balloon.api.ApiException;
import ru.stoloto.balloon.config.GameConfig;
import ru.stoloto.balloon.config.GameConfigService;
import ru.stoloto.balloon.domain.PlayerEntity;
import ru.stoloto.balloon.domain.PlayerRepository;
import ru.stoloto.balloon.domain.RoundEntity;
import ru.stoloto.balloon.domain.RoundRepository;

import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Игровой цикл: старт раунда, поток тиков по WebSocket, cashout, завершение.
 * Вся случайность и все расчёты — здесь, на сервере (требование честности ТЗ).
 */
@Service
public class RoundService {

    private static final Logger log = LoggerFactory.getLogger(RoundService.class);
    public static final String DEMO_PLAYER_ID = "guest";

    private final GameConfigService configService;
    private final SimpMessagingTemplate messaging;
    private final RoundRepository roundRepository;
    private final PlayerRepository playerRepository;
    private final RoundPersistence persistence;

    private final Map<String, ActiveRound> activeRounds = new ConcurrentHashMap<>();
    private final AtomicLong roundCounter = new AtomicLong();
    private final Random rewardRandom = new Random();

    private ScheduledExecutorService scheduler;

    public RoundService(GameConfigService configService,
                        SimpMessagingTemplate messaging,
                        RoundRepository roundRepository,
                        PlayerRepository playerRepository,
                        RoundPersistence persistence) {
        this.configService = configService;
        this.messaging = messaging;
        this.roundRepository = roundRepository;
        this.playerRepository = playerRepository;
        this.persistence = persistence;
    }

    @PostConstruct
    void startLoop() {
        GameConfig config = configService.get();
        long periodMillis = Math.max(16, (long) (config.crashModel().delta() * 1000));
        scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "round-loop");
            thread.setDaemon(true);
            return thread;
        });
        scheduler.scheduleAtFixedRate(this::tickAll, periodMillis, periodMillis, TimeUnit.MILLISECONDS);
        log.info("Round loop started, tick period {} ms", periodMillis);
    }

    @PreDestroy
    void stopLoop() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }

    /**
     * Старт раунда: списывает ставку и предрассчитывает исход.
     * Клиент получает только hash исхода — сами crashPoint и позиция бустера
     * остаются на сервере до завершения полёта.
     */
    @Transactional
    public ActiveRound start(String theme, String betOptionId, Long seed, Double speedFactor,
                             Double autoCashoutAt) {
        GameConfig config = configService.get();

        GameConfig.Theme themeConfig;
        try {
            themeConfig = config.theme(theme);
        } catch (IllegalArgumentException e) {
            throw new ApiException("VALIDATION_ERROR", "Неизвестная тема: " + theme);
        }

        GameConfig.BetOption option = themeConfig.betOptions().stream()
                .filter(candidate -> candidate.id().equals(betOptionId))
                .findFirst()
                .orElseThrow(() -> new ApiException("INVALID_BET_OPTION",
                        "Неизвестный вариант ставки: " + betOptionId));

        PlayerEntity player = persistence.player();
        if (player.getBalance() < option.cost()) {
            throw new ApiException("INSUFFICIENT_BALANCE", "Не хватает бонусов");
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

        // Dev-поля действуют только при dev_mode.enabled — иначе клиент мог бы
        // влиять на исход, что прямо запрещено требованием честности.
        boolean devMode = config.devMode() != null && config.devMode().enabled();
        Long effectiveSeed = devMode ? seed : null;
        double effectiveSpeed = devMode && speedFactor != null ? speedFactor : 1.0;

        player.withdraw(option.cost());
        playerRepository.save(player);

        RoundOutcome outcome = RoundOutcome.generate(config, theme, option.boostTier(), effectiveSeed);
        String roundId = "r-" + roundCounter.incrementAndGet();
        ActiveRound round = new ActiveRound(roundId, theme, option.cost(), option.boostTier(),
                effectiveSpeed, outcome, config);
        round.setAutoCashoutAt(autoCashoutAt);
        activeRounds.put(roundId, round);

        log.debug("Round {} started: theme={} bet={} boostTier={} crashPoint={} boostLevel={} seed={}",
                roundId, theme, option.cost(), option.boostTier(),
                outcome.crashPoint(), outcome.boostLevelIndex(), outcome.serverSeed());

        return round;
    }

    /**
     * Фиксация выигрыша. Коэффициент берётся с сервера по времени старта —
     * клиентское значение не принимается, иначе результат можно было бы подделать.
     */
    @Transactional
    public ActiveRound cashout(String roundId) {
        ActiveRound round = activeRounds.get(roundId);
        if (round == null || round.isFinished()) {
            throw new ApiException("ROUND_NOT_ACTIVE", "Раунд уже завершён");
        }
        if (round.isCashedOut()) {
            throw new ApiException("ALREADY_CASHED_OUT", "Выигрыш уже зафиксирован");
        }
        if (round.levelsCrossed() < 1) {
            throw new ApiException("ROUND_NOT_ACTIVE", "Забрать можно только после первого уровня");
        }
        if (!applyCashout(round, false)) {
            throw new ApiException("ROUND_NOT_ACTIVE", "Раунд уже завершён");
        }
        return round;
    }

    /**
     * Фиксация выигрыша и зачисление на баланс. Общая точка для ручного
     * «Забрать» и автовывода — иначе два пути расходятся, и какой-нибудь из них
     * однажды забудет начислить очки или разослать событие.
     */
    private boolean applyCashout(ActiveRound round, boolean auto) {
        if (!round.cashout()) {
            return false;
        }

        persistence.creditWin(round.winAmount());

        send("/topic/round/" + round.roundId(), Map.of(
                "type", "cashout",
                "multiplier", round2(round.cashedOutAt()),
                "winAmount", round.winAmount(),
                "points", round.points(),
                "auto", auto));

        log.debug("Round {} cashout{} at {} -> win {} points {}",
                round.roundId(), auto ? " (auto)" : "", round.cashedOutAt(),
                round.winAmount(), round.points());
        return true;
    }

    public ActiveRound active(String roundId) {
        return activeRounds.get(roundId);
    }

    /** Раунд, который сейчас летит — для восстановления состояния после перезагрузки страницы. */
    public ActiveRound currentActive() {
        return activeRounds.values().stream()
                .filter(round -> !round.isFinished())
                .findFirst()
                .orElse(null);
    }

    // --- Игровой цикл ---

    private void tickAll() {
        for (ActiveRound round : activeRounds.values()) {
            try {
                tick(round);
            } catch (Exception e) {
                log.error("Tick failed for round {}", round.roundId(), e);
            }
        }
    }

    private void tick(ActiveRound round) {
        if (round.isFinished()) {
            return;
        }
        String topic = "/topic/round/" + round.roundId();

        // 1. Пересечённые уровни (за один тик их может быть больше одного).
        Double next;
        while ((next = round.nextThreshold()) != null && round.baseMultiplier() >= next) {
            int levelIndex = round.levelsCrossed();
            int awarded = round.crossLevel();
            send(topic, Map.of(
                    "type", "level",
                    "levelIndex", levelIndex,
                    "pointsAwarded", awarded,
                    "totalPoints", round.points()));

            // 2. Бустер на этом уровне — только если игрок ещё не забрал выигрыш.
            if (levelIndex == round.outcome().boostLevelIndex()
                    && !round.isCashedOut() && !round.boostApplied()) {
                double boostValue = configService.get().boostValue(round.boostTier());
                round.applyBoost(boostValue);
                send(topic, Map.of(
                        "type", "boost",
                        "levelIndex", levelIndex,
                        "boostMultiplier", boostValue,
                        "multiplierAfter", round2(round.effectiveMultiplier())));
            }
        }

        // 3. Автовывод — проверяем до краха: если игрок выставил порог и шар его
        // достиг, выигрыш должен быть зафиксирован, даже когда крах случается
        // в этом же тике.
        if (round.autoCashoutDue()) {
            applyCashout(round, true);
        }

        // 4. Крах.
        if (round.hasCrashed()) {
            finish(round);
            return;
        }

        // 5. Обычный тик коэффициента.
        send(topic, Map.of(
                "type", "tick",
                "multiplier", round2(round.effectiveMultiplier()),
                "elapsedMs", round.elapsedMillis()));
    }

    private void finish(ActiveRound round) {
        if (!round.markFinished()) {
            return;
        }
        GameConfig config = configService.get();
        double crashAt = round2(round.outcome().crashPoint() * round.boostFactor());
        String outcomeType = round.isCashedOut() ? "cashout" : "crash";
        GameConfig.Reward reward = pickReward(config);

        RoundEntity saved = persistence.save(round, crashAt, outcomeType, reward);

        send("/topic/round/" + round.roundId(), Map.of(
                "type", "round.finished",
                "crashAt", crashAt,
                "outcome", outcomeType,
                "winAmount", round.winAmount(),
                "points", round.points(),
                "serverSeed", String.valueOf(saved.getServerSeed())));

        activeRounds.remove(round.roundId());
        log.debug("Round {} finished: {} crashAt={} win={} points={}",
                round.roundId(), outcomeType, crashAt, round.winAmount(), round.points());
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

    /**
     * Отправка события в топик раунда. Явное приведение к Object снимает
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
