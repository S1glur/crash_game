package ru.stoloto.balloon.domain;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface GameRoundRepository extends JpaRepository<GameRoundEntity, String> {

    /** Недавние раунды всех тем — свежие первыми. */
    List<GameRoundEntity> findAllByOrderByFinishedAtDesc(Limit limit);

    /** Недавние раунды одной темы. */
    List<GameRoundEntity> findAllByThemeOrderByFinishedAtDesc(String theme, Limit limit);

    /**
     * Только идентификаторы всех сохранённых раундов.
     *
     * Нужны на старте, чтобы продолжить нумерацию, а не начать её заново
     * поверх уже записанной истории. Тянем одни строки, без остальных полей:
     * записей тут тысячи, а нужен из них один максимум.
     */
    @Query("select g.roundId from GameRoundEntity g")
    List<String> findAllRoundIds();
}
