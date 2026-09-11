package ru.stoloto.balloon.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.stoloto.balloon.config.GameConfigService;
import ru.stoloto.balloon.domain.PlayerEntity;
import ru.stoloto.balloon.domain.PlayerRepository;
import ru.stoloto.balloon.security.CurrentPlayer;
import ru.stoloto.balloon.security.Usernames;

import java.util.LinkedHashMap;
import java.util.Map;

/** Регистрация, вход и выход. Сессия живёт в куке, пароли — в виде bcrypt-хеша. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final int MIN_PASSWORD_LENGTH = 6;
    private static final int MAX_DISPLAY_NAME_LENGTH = 64;

    private final AuthenticationManager authenticationManager;
    private final PlayerRepository players;
    private final PasswordEncoder passwordEncoder;
    private final GameConfigService configService;
    private final CurrentPlayer currentPlayer;

    private final SecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();

    public AuthController(AuthenticationManager authenticationManager,
                          PlayerRepository players,
                          PasswordEncoder passwordEncoder,
                          GameConfigService configService,
                          CurrentPlayer currentPlayer) {
        this.authenticationManager = authenticationManager;
        this.players = players;
        this.passwordEncoder = passwordEncoder;
        this.configService = configService;
        this.currentPlayer = currentPlayer;
    }

    /**
     * Регистрация нового игрока. Сразу выполняет вход: заставлять человека
     * вводить те же логин с паролем второй раз подряд — лишний шаг на ровном месте.
     */
    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody RegisterRequest request,
                                        HttpServletRequest httpRequest,
                                        HttpServletResponse httpResponse) {
        String username = Usernames.normalize(request.username());
        if (!Usernames.isValid(username)) {
            throw new ApiException("VALIDATION_ERROR",
                    "Логин: от 3 до 20 символов — латиница, цифры, дефис или подчёркивание");
        }

        String password = request.password() == null ? "" : request.password();
        if (password.length() < MIN_PASSWORD_LENGTH) {
            throw new ApiException("VALIDATION_ERROR",
                    "Пароль должен быть не короче " + MIN_PASSWORD_LENGTH + " символов");
        }
        if (players.existsByUsername(username)) {
            throw new ApiException("USERNAME_TAKEN", "Такой логин уже занят");
        }

        PlayerEntity player = new PlayerEntity(
                username,
                passwordEncoder.encode(password),
                displayName(request.displayName(), username),
                PlayerEntity.ROLE_PLAYER,
                configService.get().demoUser().startingBalance());
        players.save(player);

        authenticate(username, password, httpRequest, httpResponse);
        return view(player);
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody LoginRequest request,
                                     HttpServletRequest httpRequest,
                                     HttpServletResponse httpResponse) {
        String username = Usernames.normalize(request.username());
        authenticate(username, request.password() == null ? "" : request.password(),
                httpRequest, httpResponse);
        return view(currentPlayer.require());
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletRequest httpRequest) {
        HttpSession session = httpRequest.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
        return Map.of("ok", true);
    }

    /** Кто сейчас в сессии. Фронт вызывает его при загрузке страницы. */
    @GetMapping("/me")
    public Map<String, Object> me() {
        return view(currentPlayer.require());
    }

    private void authenticate(String username, String password,
                              HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(username, password));
        } catch (AuthenticationException e) {
            // Не уточняем, логин неверен или пароль: иначе форма превращается
            // в инструмент проверки существования аккаунтов.
            throw new ApiException("INVALID_CREDENTIALS", "Неверный логин или пароль");
        }

        // Смена идентификатора сессии при входе закрывает session fixation:
        // иначе выданный до входа идентификатор остался бы действительным.
        if (httpRequest.getSession(false) != null) {
            httpRequest.changeSessionId();
        }

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        // Сохранять контекст нужно явно: сам по себе он в сессию больше не
        // попадает, и следующий запрос пришёл бы уже анонимным.
        contextRepository.saveContext(context, httpRequest, httpResponse);
    }

    private static String displayName(String raw, String username) {
        String trimmed = raw == null ? "" : raw.trim();
        if (trimmed.isEmpty()) {
            return username;
        }
        return trimmed.length() > MAX_DISPLAY_NAME_LENGTH
                ? trimmed.substring(0, MAX_DISPLAY_NAME_LENGTH)
                : trimmed;
    }

    /** Пароль и хеш наружу не отдаются никогда — только то, что рисует интерфейс. */
    private static Map<String, Object> view(PlayerEntity player) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", player.getId());
        body.put("username", player.getUsername());
        body.put("displayName", player.getDisplayName());
        body.put("role", player.getRole());
        body.put("balance", player.getBalance());
        body.put("totalPoints", player.getTotalPoints());
        return body;
    }

    public record RegisterRequest(String username, String password, String displayName) {}

    public record LoginRequest(String username, String password) {}
}
