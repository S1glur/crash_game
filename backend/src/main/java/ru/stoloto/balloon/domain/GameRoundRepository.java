package ru.stoloto.balloon.domain;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GameRoundRepository extends JpaRepository<GameRoundEntity, String> {

    /** Недавние раунды всех тем — свежие первыми. */
    List<GameRoundEntity> findAllByOrderByFinishedAtDesc(Limit limit);

    /** Недавние раунды одной темы. */
    List<GameRoundEntity> findAllByThemeOrderByFinishedAtDesc(String theme, Limit limit);
}
