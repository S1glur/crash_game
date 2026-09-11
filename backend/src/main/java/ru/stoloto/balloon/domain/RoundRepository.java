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

    /** История одного игрока — для личной статистики. */
    List<RoundEntity> findAllByPlayerIdOrderByFinishedAtDesc(String playerId, Limit limit);
}
