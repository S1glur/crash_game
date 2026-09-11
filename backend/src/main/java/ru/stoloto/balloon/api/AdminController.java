package ru.stoloto.balloon.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.stoloto.balloon.domain.PlayerEntity;
import ru.stoloto.balloon.domain.PlayerRepository;
import ru.stoloto.balloon.domain.RoundEntity;
import ru.stoloto.balloon.domain.RoundRepository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Отчётность для администратора продукта.
 *
 * Считается на лету из таблицы раундов — в прототипе их сотни, и отдельное
 * хранилище агрегатов только разошлось бы с исходными данными. Доступ закрыт
 * ролью ADMIN в SecurityConfig.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    /**
     * Границы корзин распределения точки краха. Разбиение неравномерное:
     * половина раундов заканчивается ниже 2.0, и равномерные корзины
     * свалили бы их все в одну.
     */
    private static final double[] BUCKETS = {1.0, 1.1, 1.5, 2.0, 3.0, 5.0, 10.0, Double.POSITIVE_INFINITY};

    private final RoundRepository rounds;
    private final PlayerRepository players;

    public AdminController(RoundRepository rounds, PlayerRepository players) {
        this.rounds = rounds;
        this.players = players;
    }

    @GetMapping("/report")
    public Map<String, Object> report() {
        List<RoundEntity> all = rounds.findAll();
        List<PlayerEntity> allPlayers = players.findAll();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("generatedAt", Instant.now().toString());
        body.put("totals", totals(all, allPlayers));
        body.put("crashDistribution", crashDistribution(all));
        body.put("boostTiers", boostTiers(all));
        body.put("themes", themes(all));
        body.put("players", playerRows(all, allPlayers));
        body.put("recent", recent());
        return body;
    }

    private Map<String, Object> totals(List<RoundEntity> all, List<PlayerEntity> allPlayers) {
        long staked = 0;
        long boostFees = 0;
        long paidOut = 0;
        long points = 0;
        int cashouts = 0;
        double maxMultiplier = 0;

        List<Double> crashes = new ArrayList<>(all.size());
        for (RoundEntity round : all) {
            staked += round.getStake();
            boostFees += round.getBoostFee();
            paidOut += round.getWinAmount();
            points += round.getPoints();
            if ("cashout".equals(round.getOutcome())) {
                cashouts++;
            }
            crashes.add(round.getCrashAt());
            maxMultiplier = Math.max(maxMultiplier, round.getCrashAt());
        }

        long totalPaid = staked + boostFees;
        crashes.sort(Comparator.naturalOrder());

        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("players", allPlayers.size());
        totals.put("rounds", all.size());
        totals.put("staked", staked);
        totals.put("boostFees", boostFees);
        totals.put("totalPaid", totalPaid);
        totals.put("paidOut", paidOut);
        totals.put("houseNet", totalPaid - paidOut);
        // Возврат игроку: сколько выплачено на каждый вложенный балл, считая
        // доплату за бустер — она сгорает всегда и в выплате не участвует.
        totals.put("rtp", totalPaid == 0 ? 0.0 : round4((double) paidOut / totalPaid));
        totals.put("pointsAwarded", points);
        totals.put("cashoutRounds", cashouts);
        totals.put("crashRounds", all.size() - cashouts);
        totals.put("cashoutShare", all.isEmpty() ? 0.0 : round4((double) cashouts / all.size()));
        totals.put("meanCrash", crashes.isEmpty() ? 0.0
                : round4(crashes.stream().mapToDouble(Double::doubleValue).sum() / crashes.size()));
        totals.put("medianCrash", crashes.isEmpty() ? 0.0 : round4(crashes.get(crashes.size() / 2)));
        totals.put("maxCrash", round4(maxMultiplier));
        return totals;
    }

    private List<Map<String, Object>> crashDistribution(List<RoundEntity> all) {
        int[] counts = new int[BUCKETS.length - 1];
        for (RoundEntity round : all) {
            double crash = round.getCrashAt();
            for (int i = 0; i < counts.length; i++) {
                if (crash >= BUCKETS[i] && crash < BUCKETS[i + 1]) {
                    counts[i]++;
                    break;
                }
            }
        }

        List<Map<String, Object>> buckets = new ArrayList<>(counts.length);
        for (int i = 0; i < counts.length; i++) {
            Map<String, Object> bucket = new LinkedHashMap<>();
            bucket.put("from", BUCKETS[i]);
            bucket.put("to", Double.isInfinite(BUCKETS[i + 1]) ? null : BUCKETS[i + 1]);
            bucket.put("count", counts[i]);
            bucket.put("share", all.isEmpty() ? 0.0 : round4((double) counts[i] / all.size()));
            buckets.add(bucket);
        }
        return buckets;
    }

    /** Насколько бустер окупается: как часто его покупают и как часто он успевает сработать. */
    private List<Map<String, Object>> boostTiers(List<RoundEntity> all) {
        Map<Integer, int[]> byTier = new HashMap<>();
        Map<Integer, long[]> money = new HashMap<>();
        for (RoundEntity round : all) {
            int tier = round.getBoostTier();
            int[] counts = byTier.computeIfAbsent(tier, key -> new int[2]);
            counts[0]++;
            if (round.isBoostApplied()) {
                counts[1]++;
            }
            long[] sums = money.computeIfAbsent(tier, key -> new long[2]);
            sums[0] += round.getBoostFee();
            sums[1] += round.getWinAmount();
        }

        List<Map<String, Object>> tiers = new ArrayList<>();
        byTier.keySet().stream().sorted().forEach(tier -> {
            int[] counts = byTier.get(tier);
            long[] sums = money.get(tier);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("tier", tier);
            row.put("rounds", counts[0]);
            row.put("applied", counts[1]);
            row.put("appliedShare", counts[0] == 0 ? 0.0 : round4((double) counts[1] / counts[0]));
            row.put("feesPaid", sums[0]);
            row.put("wonWith", sums[1]);
            tiers.add(row);
        });
        return tiers;
    }

    private List<Map<String, Object>> themes(List<RoundEntity> all) {
        Map<String, long[]> byTheme = new HashMap<>();
        for (RoundEntity round : all) {
            // [раундов, уплачено, выплачено]
            long[] sums = byTheme.computeIfAbsent(round.getTheme(), key -> new long[3]);
            sums[0]++;
            sums[1] += round.getTotalPaid();
            sums[2] += round.getWinAmount();
        }

        List<Map<String, Object>> list = new ArrayList<>();
        byTheme.forEach((theme, sums) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("theme", theme);
            row.put("rounds", sums[0]);
            row.put("totalPaid", sums[1]);
            row.put("paidOut", sums[2]);
            row.put("rtp", sums[1] == 0 ? 0.0 : round4((double) sums[2] / sums[1]));
            list.add(row);
        });
        list.sort(Comparator.comparingLong(
                (Map<String, Object> row) -> -((Number) row.get("rounds")).longValue()));
        return list;
    }

    private List<Map<String, Object>> playerRows(List<RoundEntity> all, List<PlayerEntity> allPlayers) {
        Map<String, long[]> stats = new HashMap<>();
        Map<String, Double> best = new HashMap<>();
        for (RoundEntity round : all) {
            // [раундов, ставки, уплачено всего, выплачено, очки]
            long[] sums = stats.computeIfAbsent(round.getPlayerId(), key -> new long[5]);
            sums[0]++;
            sums[1] += round.getStake();
            sums[2] += round.getTotalPaid();
            sums[3] += round.getWinAmount();
            sums[4] += round.getPoints();
            if (round.getCashedOutAt() != null) {
                best.merge(round.getPlayerId(), round.getCashedOutAt(), Math::max);
            }
        }

        List<Map<String, Object>> list = new ArrayList<>(allPlayers.size());
        for (PlayerEntity player : allPlayers) {
            long[] sums = stats.getOrDefault(player.getId(), new long[5]);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", player.getId());
            row.put("username", player.getUsername());
            row.put("displayName", player.getDisplayName());
            row.put("role", player.getRole());
            row.put("balance", player.getBalance());
            row.put("totalPoints", player.getTotalPoints());
            row.put("rounds", sums[0]);
            row.put("staked", sums[1]);
            row.put("totalPaid", sums[2]);
            row.put("paidOut", sums[3]);
            row.put("net", sums[3] - sums[2]);
            row.put("roundPoints", sums[4]);
            row.put("bestMultiplier", best.getOrDefault(player.getId(), 0.0));
            list.add(row);
        }
        list.sort(Comparator.comparingLong(
                (Map<String, Object> row) -> -((Number) row.get("totalPaid")).longValue()));
        return list;
    }

    private List<Map<String, Object>> recent() {
        Map<String, String> names = new HashMap<>();
        players.findAll().forEach(player -> names.put(player.getId(), player.getDisplayName()));

        List<Map<String, Object>> list = new ArrayList<>();
        for (RoundEntity round : rounds.findAllByOrderByFinishedAtDesc(org.springframework.data.domain.Limit.of(25))) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("roundId", round.getRoundId());
            row.put("player", names.getOrDefault(round.getPlayerId(), "—"));
            row.put("theme", round.getTheme());
            row.put("stake", round.getStake());
            row.put("totalPaid", round.getTotalPaid());
            row.put("outcome", round.getOutcome());
            row.put("multiplier", round.getCashedOutAt() != null ? round.getCashedOutAt() : round.getCrashAt());
            row.put("crashAt", round.getCrashAt());
            row.put("winAmount", round.getWinAmount());
            row.put("points", round.getPoints());
            row.put("boostTier", round.getBoostTier());
            row.put("boostApplied", round.isBoostApplied());
            row.put("finishedAt", round.getFinishedAt().toString());
            list.add(row);
        }
        return list;
    }

    private static double round4(double value) {
        return Math.round(value * 10000.0) / 10000.0;
    }
}
