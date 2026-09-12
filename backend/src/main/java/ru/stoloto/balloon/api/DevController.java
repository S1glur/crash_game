package ru.stoloto.balloon.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ru.stoloto.balloon.config.GameConfig;
import ru.stoloto.balloon.config.GameConfigService;
import ru.stoloto.balloon.game.RoundOutcome;
import ru.stoloto.balloon.game.RoundService;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Статистика мат. модели прогоном N раундов. Нужна, чтобы обосновать модель
 * расчётами, а не исходом одного случайного раунда (требование ТЗ к сценарию 5).
 */
@RestController
@RequestMapping("/api/dev")
public class DevController {

    private final GameConfigService configService;

    public DevController(GameConfigService configService) {
        this.configService = configService;
    }

    @GetMapping("/simulate")
    public Map<String, Object> simulate(@RequestParam(defaultValue = "10000") int rounds,
                                        @RequestParam(defaultValue = "green") String theme) {
        GameConfig config = configService.get();
        if (config.devMode() == null || !config.devMode().enabled()) {
            throw new ApiException("VALIDATION_ERROR", "Dev-режим выключен в config/game.json");
        }
        int capped = Math.clamp(rounds, 1, 1_000_000);

        double[] crashes = new double[capped];
        for (int i = 0; i < capped; i++) {
            crashes[i] = RoundOutcome.generate(config, theme, 1, null).crashPoint();
        }
        Arrays.sort(crashes);

        double sum = 0;
        int below2 = 0;
        int above10 = 0;
        for (double crash : crashes) {
            sum += crash;
            if (crash < 2.0) {
                below2++;
            }
            if (crash >= 10.0) {
                above10++;
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("rounds", capped);
        body.put("theme", theme);
        body.put("meanCrash", round3(sum / capped));
        body.put("medianCrash", round3(crashes[capped / 2]));
        body.put("crashBelow2Pct", round3(100.0 * below2 / capped));
        body.put("crashAbove10Pct", round3(100.0 * above10 / capped));
        body.put("maxCrash", round3(crashes[capped - 1]));
        body.put("levelsReachedAvg", round3(averageLevels(config, theme, crashes)));
        return body;
    }

    private double averageLevels(GameConfig config, String theme, double[] crashes) {
        var thresholds = config.theme(theme).levelThresholds();
        long total = 0;
        for (double crash : crashes) {
            for (double threshold : thresholds) {
                if (crash >= threshold) {
                    total++;
                }
            }
        }
        return (double) total / crashes.length;
    }

    private static double round3(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }
}
