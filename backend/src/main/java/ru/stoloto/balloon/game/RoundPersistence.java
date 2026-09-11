package ru.stoloto.balloon.game;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import ru.stoloto.balloon.api.ApiException;
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
 *
 * По той же причине методы принимают идентификатор игрока, а не саму сущность:
 * в потоке планировщика нет ни сессии, ни контекста безопасности, откуда её
 * можно было бы взять.
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

    @Transactional(readOnly = true)
    public PlayerEntity player(String playerId) {
        return playerRepository.findById(playerId)
                .orElseThrow(() -> new ApiException("UNAUTHORIZED", "Аккаунт не найден"));
    }

    /**
     * Пополнение баланса до стартового значения из конфига.
     *
     * ТЗ требует, чтобы эксперт прошёл все сценарии без обращения к команде.
     * Проиграв баланс до суммы меньше минимальной ставки, он иначе попадает
     * в тупик, из которого выводит только перезапуск сервера.
     *
     * Пополняем именно ДО стартового значения, а не прибавляем: так баланс не
     * накрутить выше исходного, и таблица очков остаётся сопоставимой.
     *
     * @return сколько начислено (0, если баланс и так не ниже стартового)
     */
    @Transactional
    public int topUpToStart(String playerId) {
        PlayerEntity player = player(playerId);
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
    public void creditWin(String playerId, int amount) {
        PlayerEntity player = player(playerId);
        player.deposit(amount);
        playerRepository.save(player);
    }

    @Transactional
    public RoundEntity save(ActiveRound round, double crashAt, String outcomeType,
                            GameConfig.Reward reward) {
        RoundEntity entity = new RoundEntity(
                round.roundId(),
                round.playerId(),
                round.theme(),
                round.stake(),
                round.boostFee(),
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

        PlayerEntity player = player(round.playerId());
        player.addPoints(round.points());
        playerRepository.save(player);

        return entity;
    }
}
