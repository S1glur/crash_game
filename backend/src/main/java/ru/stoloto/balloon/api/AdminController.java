package ru.stoloto.balloon.api;

import org.springframework.data.domain.Limit;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.stoloto.balloon.domain.GameRoundEntity;
import ru.stoloto.balloon.domain.GameRoundRepository;
import ru.stoloto.balloon.domain.PlayerRepository;
import ru.stoloto.balloon.domain.RoundEntity;
import ru.stoloto.balloon.domain.RoundRepository;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Отчётность для администратора продукта: сколько игра приняла, сколько отдала
 * и что осталось.
 *
 * Считается на лету из таблиц раундов — в прототипе их сотни, и отдельное
 * хранилище агрегатов только разошлось бы с исходными данными. Доступ закрыт
 * ролью ADMIN в SecurityConfig.
 *
 * Ключевое решение: всё, что относится к ходу игры — сколько было полётов, где
 * лопнул шар, сколько собрал раунд, — считается по таблице `game_rounds`, то
 * есть по самим полётам. Раньше это считалось по `rounds`, то есть по ставкам
 * участников, и цифры врали дважды: раунд с тремя участниками попадал в
 * статистику трижды, а раунды, в которых никто не играл, не попадали вообще,
 * хотя цикл идёт непрерывно и такие раунды состоялись. По ставкам теперь
 * считается только то, что действительно про ставки: сколько внесли игроки и
 * сколько из этого ушло на доплату за бустер.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    /** Сколько последних полётов показывать на экране. Весь журнал — в выгрузке. */
    private static final int RECENT_LIMIT = 12;

    /**
     * Время в выгрузке — московское, а не то, в котором живёт сервер.
     *
     * Часовой пояс машины брать нельзя: контейнер на хостинге работает в UTC,
     * и журнал приезжал бы к администратору со временем на три часа назад.
     * Отчёт читают люди в Москве, поэтому зона зафиксирована.
     */
    private static final ZoneId REPORT_ZONE = ZoneId.of("Europe/Moscow");

    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss").withZone(REPORT_ZONE);

    private final GameRoundRepository flights;
    private final RoundRepository bets;
    private final PlayerRepository players;

    public AdminController(GameRoundRepository flights, RoundRepository bets, PlayerRepository players) {
        this.flights = flights;
        this.bets = bets;
        this.players = players;
    }

    @GetMapping("/report")
    public Map<String, Object> report() {
        Totals totals = collect();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("generatedAt", Instant.now().toString());
        body.put("totals", totals.toMap());
        body.put("recent", recentFlights());
        return body;
    }

    /**
     * Журнал всех полётов таблицей.
     *
     * Разделитель — точка с запятой, дробная часть — через запятую: так файл
     * открывается двойным щелчком в русском Excel без мастера импорта. BOM
     * нужен там же, иначе кириллица в заголовках превращается в кракозябры.
     */
    @GetMapping(value = "/rounds.csv", produces = "text/csv; charset=UTF-8")
    public ResponseEntity<byte[]> roundsCsv() {
        Totals totals = collect();
        StringBuilder csv = new StringBuilder("﻿");

        csv.append("Воздушный Шар — журнал раундов\n");
        csv.append("Снято;").append(STAMP.format(Instant.now())).append('\n');
        csv.append("Полётов;").append(totals.flights).append('\n');
        csv.append("Из них со ставками;").append(totals.flightsWithBets).append('\n');
        csv.append("Игроков;").append(totals.players).append('\n');
        csv.append("Из них делали ставки;").append(totals.playersWithBets).append('\n');
        csv.append("Принято;").append(totals.accepted()).append('\n');
        csv.append("Выплачено;").append(totals.paidOut).append('\n');
        csv.append("Прибыль игры;").append(signed(totals.houseNet())).append('\n');
        csv.append("Возврат игроку;").append(decimal(totals.rtp() * 100)).append(" %\n");
        csv.append('\n');

        csv.append("Раунд;Время;Тема;Крах;Ставок;Принято;Выплачено;Прибыль\n");
        for (GameRoundEntity flight : flights.findAllByOrderByFinishedAtDesc(Limit.of(10000))) {
            csv.append(flight.getRoundId()).append(';')
                    .append(STAMP.format(flight.getFinishedAt())).append(';')
                    .append(themeName(flight.getTheme())).append(';')
                    .append(decimal(flight.getCrashAt())).append(';')
                    .append(flight.getBetCount()).append(';')
                    .append(flight.getTotalStake()).append(';')
                    .append(flight.getTotalWin()).append(';')
                    .append(signed(flight.getTotalStake() - flight.getTotalWin())).append('\n');
        }

        byte[] bytes = csv.toString().getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("balloon-rounds.csv", StandardCharsets.UTF_8).build().toString())
                .body(bytes);
    }

    /** Один проход по обеим таблицам: экран и выгрузка считают одно и то же. */
    private Totals collect() {
        Totals totals = new Totals();

        for (GameRoundEntity flight : flights.findAll()) {
            totals.flights++;
            if (flight.getBetCount() > 0) {
                totals.flightsWithBets++;
            }
            totals.paidOut += flight.getTotalWin();
        }

        Set<String> betting = new HashSet<>();
        for (RoundEntity bet : bets.findAll()) {
            totals.staked += bet.getStake();
            totals.boostFees += bet.getBoostFee();
            betting.add(bet.getPlayerId());
        }

        totals.players = players.count();
        totals.playersWithBets = betting.size();
        return totals;
    }

    private List<Map<String, Object>> recentFlights() {
        List<Map<String, Object>> list = new ArrayList<>(RECENT_LIMIT);
        for (GameRoundEntity flight : flights.findAllByOrderByFinishedAtDesc(Limit.of(RECENT_LIMIT))) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("roundId", flight.getRoundId());
            row.put("theme", flight.getTheme());
            row.put("crashAt", flight.getCrashAt());
            row.put("betCount", flight.getBetCount());
            row.put("accepted", flight.getTotalStake());
            row.put("paidOut", flight.getTotalWin());
            row.put("finishedAt", flight.getFinishedAt().toString());
            list.add(row);
        }
        return list;
    }

    private static String themeName(String theme) {
        return "green".equals(theme) ? "Изумруд" : "Бордо";
    }

    /** Убыток в выгрузке должен читаться как убыток, поэтому плюс пишем явно. */
    private static String signed(long value) {
        return (value > 0 ? "+" : "") + value;
    }

    private static String decimal(double value) {
        return String.format(Locale.ROOT, "%.2f", value).replace('.', ',');
    }

    /**
     * Итоги периода. Приход разделён на ставки и доплату за бустер намеренно:
     * доплата сгорает всегда и в выплате не участвует, и без этого разделения
     * непонятно, за счёт чего игра остаётся в плюсе.
     */
    private static final class Totals {
        long flights;
        long flightsWithBets;
        long players;
        long playersWithBets;
        long staked;
        long boostFees;
        long paidOut;

        long accepted() {
            return staked + boostFees;
        }

        long houseNet() {
            return accepted() - paidOut;
        }

        double rtp() {
            return accepted() == 0 ? 0.0 : Math.round((double) paidOut / accepted() * 10000.0) / 10000.0;
        }

        Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("flights", flights);
            map.put("flightsWithBets", flightsWithBets);
            map.put("players", players);
            map.put("playersWithBets", playersWithBets);
            map.put("staked", staked);
            map.put("boostFees", boostFees);
            map.put("accepted", accepted());
            map.put("paidOut", paidOut);
            map.put("houseNet", houseNet());
            map.put("rtp", rtp());
            return map;
        }
    }
}
