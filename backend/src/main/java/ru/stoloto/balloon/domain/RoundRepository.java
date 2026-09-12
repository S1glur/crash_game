package ru.stoloto.balloon.domain;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RoundRepository extends JpaRepository<RoundEntity, String> {

    /**
     * История игр всех участников прототипа — свежие первыми.
     * Общая, а не персональная: этого прямо требует сценарий 1 из ТЗ.
     */
    List<RoundEntity> findAllByOrderByFinishedAtDesc(Limit limit);

    /** Участники одного раунда — кто сколько поставил и сколько забрал. */
    List<RoundEntity> findAllByRoundIdOrderByWinAmountDesc(String roundId);

    /** Ставки в нескольких раундах сразу — для списка недавних раундов. */
    List<RoundEntity> findAllByRoundIdIn(List<String> roundIds);

    /** История одного игрока — для личной статистики. */
    List<RoundEntity> findAllByPlayerIdOrderByFinishedAtDesc(String playerId, Limit limit);
}
