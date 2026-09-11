package ru.stoloto.balloon.game;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import ru.stoloto.balloon.config.GameConfig;
import ru.stoloto.balloon.config.GameConfigService;
import ru.stoloto.balloon.domain.PlayerEntity;
import ru.stoloto.balloon.domain.PlayerRepository;
import ru.stoloto.balloon.domain.RoundEntity;
import ru.stoloto.balloon.domain.RoundRepository;

/**
 * Запись в БД вынесена отдельным бином намеренно: завершение раунда происходит
 * в потоке планировщика, а @Transactional работает только через прокси Spring —
 * при вызове метода изнутри того же класса транзакция бы не открылась.
 */
@Component
public class RoundPersistence {

    private final RoundRepository roundRepository;
    private final PlayerRepository playerRepository;
    private final GameConfigService configService;

    public RoundPersistence(RoundRepository roundRepository,
                            PlayerRepository playerRepository,
                            GameConfigService configService) {
        this.roundRepository = roundRepository;
        this.playerRepository = playerRepository;
        this.configService = configService;
    }

    /** Демо-игрок; создаётся при первом обращении с балансом из конфига. */
    @Transactional
    public PlayerEntity player() {
        return playerRepository.findById(RoundService.DEMO_PLAYER_ID).orElseGet(() -> {
            GameConfig config = configService.get();
            return playerRepository.save(new PlayerEntity(
                    RoundService.DEMO_PLAYER_ID, config.demoUser().startingBalance()));
        });
    }

    /**
     * Пополнение демо-баланса до стартового значения из конфига.
     *
     * ТЗ требует, чтобы эксперт прошёл все сценарии без обращения к команде.
     * Проиграв баланс до суммы меньше самой дешёвой ставки, он иначе попадает
     * в тупик, из которого выводит только перезапуск сервера.
     *
     * Пополняем именно ДО стартового значения, а не прибавляем: так баланс не
     * накрутить выше исходного, и таблица очков остаётся сопоставимой.
     *
     * @return сколько начислено (0, если баланс и так не ниже стартового)
     */
    @Transactional
    public int topUpToStart() {
        PlayerEntity player = player();
        int missing = configService.get().demoUser().startingBalance() - player.getBalance();
        if (missing <= 0) {
            return 0;
        }
        player.deposit(missing);
        playerRepository.save(player);
        return missing;
    }

    /**
     * Зачисление выигрыша. Отдельный транзакционный метод, потому что автовывод
     * срабатывает в потоке планировщика, где транзакции нет.
     */
    @Transactional
    public void creditWin(int amount) {
        PlayerEntity player = player();
        player.deposit(amount);
        playerRepository.save(player);
    }

    @Transactional
    public RoundEntity save(ActiveRound round, double crashAt, String outcomeType,
                            GameConfig.Reward reward) {
        RoundEntity entity = new RoundEntity(
                round.roundId(),
                round.theme(),
                round.bet(),
                outcomeType,
                round.cashedOutAt() == null ? null : RoundService.round2(round.cashedOutAt()),
                crashAt,
                round.winAmount(),
                round.points(),
                round.boostTier(),
                round.boostApplied(),
                reward.id(),
                reward.type(),
                round.outcome().hash(),
                round.outcome().serverSeed(),
                round.outcome().crashPoint(),
                round.outcome().boostLevelIndex());

        roundRepository.save(entity);

        PlayerEntity player = player();
        player.addPoints(round.points());
        playerRepository.save(player);

        return entity;
    }
}
