package ru.stoloto.balloon.security;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import ru.stoloto.balloon.api.ApiException;
import ru.stoloto.balloon.domain.PlayerEntity;
import ru.stoloto.balloon.domain.PlayerRepository;

/**
 * Аккаунт, от имени которого пришёл запрос.
 *
 * Сущность берётся из базы на каждый вызов, а не кэшируется в сессии: баланс и
 * очки меняются в потоке игрового цикла, и копия в сессии устаревала бы сразу
 * после первого же раунда.
 */
@Component
public class CurrentPlayer {

    private final PlayerRepository players;

    public CurrentPlayer(PlayerRepository players) {
        this.players = players;
    }

    public PlayerEntity require() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            throw new ApiException("UNAUTHORIZED", "Требуется вход в аккаунт");
        }
        return players.findByUsername(Usernames.normalize(auth.getName()))
                .orElseThrow(() -> new ApiException("UNAUTHORIZED", "Аккаунт не найден"));
    }
}
