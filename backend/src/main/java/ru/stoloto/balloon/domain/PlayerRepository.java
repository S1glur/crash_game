package ru.stoloto.balloon.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlayerRepository extends JpaRepository<PlayerEntity, String> {

    Optional<PlayerEntity> findByUsername(String username);

    boolean existsByUsername(String username);

    /** Таблица участников турнира — лидеры первыми. */
    List<PlayerEntity> findAllByOrderByTotalPointsDesc();
}
