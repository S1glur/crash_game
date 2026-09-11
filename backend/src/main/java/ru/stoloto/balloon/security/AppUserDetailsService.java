package ru.stoloto.balloon.security;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import ru.stoloto.balloon.domain.PlayerEntity;
import ru.stoloto.balloon.domain.PlayerRepository;

/** Мост между таблицей players и механизмом входа Spring Security. */
@Service
public class AppUserDetailsService implements UserDetailsService {

    private final PlayerRepository players;

    public AppUserDetailsService(PlayerRepository players) {
        this.players = players;
    }

    @Override
    public UserDetails loadUserByUsername(String username) {
        PlayerEntity player = players.findByUsername(Usernames.normalize(username))
                .orElseThrow(() -> new UsernameNotFoundException("Аккаунт не найден"));

        // roles() сам добавит префикс ROLE_, поэтому в базе лежит чистое "ADMIN"/"PLAYER".
        return User.withUsername(player.getUsername())
                .password(player.getPasswordHash())
                .roles(player.getRole())
                .build();
    }
}
