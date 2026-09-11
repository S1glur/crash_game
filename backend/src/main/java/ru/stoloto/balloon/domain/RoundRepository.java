package ru.stoloto.balloon.domain;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RoundRepository extends JpaRepository<RoundEntity, String> {

    /** История игр — свежие первыми (пункт сценария 1). */
    List<RoundEntity> findAllByOrderByFinishedAtDesc(Limit limit);
}
