package ru.stoloto.balloon.game;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.stoloto.balloon.domain.PlayerEntity;
import ru.stoloto.balloon.domain.PlayerRepository;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Турнирный рейтинг всех участников (§1.6 и §1.7 ТЗ).
 *
 * Очки складываются из двух частей: накопленных в аккаунте и набранных прямо
 * сейчас, в ещё не завершённом раунде. Без второй половины рейтинг оживал бы
 * только после краха, а ТЗ требует, чтобы позиция менялась в момент
 * пересечения уровня — то есть во время полёта.
 *
 * Зависимость односторонняя: RoundService знает о рейтинге и передаёт сюда очки
 * летящих раундов. Обратной связи нет, иначе получился бы цикл бинов.
 */
@Service
public class LeaderboardService {

    public static final String TOPIC = "/topic/leaderboard";

    private final PlayerRepository players;
    private final SimpMessagingTemplate messaging;

    public LeaderboardService(PlayerRepository players, SimpMessagingTemplate messaging) {
        this.players = players;
        this.messaging = messaging;
    }

    /**
     * Строки рейтинга, лидеры первыми.
     *
     * @param inFlightPoints очки незавершённых раундов по игрокам
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> rows(Map<String, Integer> inFlightPoints) {
        List<PlayerEntity> all = players.findAll();

        List<Map<String, Object>> rows = new ArrayList<>(all.size());
        for (PlayerEntity player : all) {
            int flying = inFlightPoints.getOrDefault(player.getId(), 0);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("playerId", player.getId());
            row.put("name", player.getDisplayName());
            row.put("points", player.getTotalPoints() + flying);
            // Отдельно — чтобы интерфейс мог подсветить тех, кто сейчас в воздухе.
            row.put("inFlight", flying > 0);
            rows.add(row);
        }

        rows.sort(Comparator.comparingInt((Map<String, Object> row) -> (int) row.get("points")).reversed());
        for (int i = 0; i < rows.size(); i++) {
            rows.get(i).put("place", i + 1);
        }
        return rows;
    }

    public void broadcast(Map<String, Integer> inFlightPoints) {
        messaging.convertAndSend(TOPIC, (Object) Map.of("rows", rows(inFlightPoints)));
    }
}
