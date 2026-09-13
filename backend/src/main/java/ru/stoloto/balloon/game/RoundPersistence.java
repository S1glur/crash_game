package ru.stoloto.balloon.game;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import ru.stoloto.balloon.api.ApiException;
import ru.stoloto.balloon.config.GameConfig;
import ru.stoloto.balloon.config.GameConfigService;
import ru.stoloto.balloon.domain.PlayerEntity;
import ru.stoloto.balloon.domain.PlayerRepository;
import ru.stoloto.balloon.domain.GameRoundEntity;
import ru.stoloto.balloon.domain.GameRoundRepository;
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
    private final GameRoundRepository gameRoundRepository;
    private final PlayerRepository playerRepository;
    private final GameConfigService configService;

    public RoundPersistence(RoundRepository roundRepository,
                            GameRoundRepository gameRoundRepository,
                            PlayerRepository playerRepository,
                            GameConfigService configService) {
        this.roundRepository = roundRepository;
        this.gameRoundRepository = gameRoundRepository;
        this.playerRepository = playerRepository;
        this.configService = configService;
    }

    /**
     * Наибольший номер раунда в истории.
     *
     * Идентификатор раунда — первичный ключ таблицы полётов, а нумерация
     * живёт в памяти процесса. После перезапуска она начиналась с нуля, и
     * новый «r-1» молча затирал прошлый «r-1» вместе с его участниками и
     * выплатами. Ставки при этом оставались: у них собственный ключ. Отчёт
     * после каждого перезапуска показывал приход без ушедших с ним выплат —
     * то есть прибыль, взявшуюся из воздуха.
     */
    @Transactional(readOnly = true)
    public long maxRoundNumber() {
        long max = 0;
        for (String id : gameRoundRepository.findAllRoundIds()) {
            int dash = id.indexOf('-');
            if (dash < 0) {
                continue;
            }
            try {
                max = Math.max(max, Long.parseLong(id.substring(dash + 1)));
            } catch (NumberFormatException e) {
                // Идентификатор не нашей формы — в нумерации не участвует.
            }
        }
        return max;
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

    /**
     * Сохраняет завершённый раунд целиком: сам полёт и все ставки в нём.
     *
     * Раунд пишется даже когда участников не было — цикл крутится непрерывно, и
     * пустой раунд тоже состоялся. Иначе история выглядела бы прерывистой.
     */
    @Transactional
    public void saveRound(SharedRound round, double crashAt) {
        gameRoundRepository.save(new GameRoundEntity(
                round.roundId(),
                round.theme(),
                crashAt,
                round.betCount(),
                round.bets().stream().mapToInt(Bet::totalPaid).sum(),
                round.totalWin(),
                round.outcome().hash(),
                round.outcome().serverSeed(),
                round.outcome().crashPoint(),
                round.outcome().boostLevelIndex()));

        for (Bet bet : round.bets()) {
            roundRepository.save(new RoundEntity(
                    round.roundId(),
                    bet.playerId(),
                    round.theme(),
                    bet.stake(),
                    bet.boostFee(),
                    bet.outcome(),
                    bet.cashedOutAt() == null ? null : RoundService.round2(bet.cashedOutAt()),
                    crashAt,
                    bet.winAmount(),
                    bet.points(),
                    bet.boostTier(),
                    bet.boostApplied(),
                    bet.rewardId(),
                    bet.rewardType(),
                    round.outcome().hash(),
                    round.outcome().serverSeed(),
                    round.outcome().crashPoint(),
                    round.outcome().boostLevelIndex()));

            PlayerEntity player = player(bet.playerId());
            player.addPoints(bet.points());
            playerRepository.save(player);
        }
    }

    /** Списание ставки при её приёме. Отдельный метод — ставку принимает REST-поток. */
    @Transactional
    public void chargeBet(String playerId, int amount) {
        PlayerEntity player = player(playerId);
        player.withdraw(amount);
        playerRepository.save(player);
    }

    /** Возврат ставки при отмене до взлёта. */
    @Transactional
    public void refundBet(String playerId, int amount) {
        PlayerEntity player = player(playerId);
        player.deposit(amount);
        playerRepository.save(player);
    }
}
