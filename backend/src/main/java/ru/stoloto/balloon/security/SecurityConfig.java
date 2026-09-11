package ru.stoloto.balloon.security;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Вход по логину и паролю с сессионной кукой.
 *
 * Роли решают две задачи ТЗ сразу: экономику игры (PUT /api/config) может
 * менять только администратор, а расчёты остаются на сервере, недоступные
 * игроку. До появления аккаунтов конфиг мог переписать любой открывший вкладку.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    AuthenticationManager authenticationManager(UserDetailsService userDetailsService,
                                                PasswordEncoder passwordEncoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return new ProviderManager(provider);
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                /*
                  CSRF выключен осознанно: API отвечает только на JSON, а браузер
                  не отправит межсайтовый POST с сессионной кукой — она помечена
                  SameSite=Lax (см. application.properties). Форм, которые можно
                  было бы подделать с чужого сайта, у игры нет.
                */
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                // Консоль H2 рисуется во фрейме — без этого она остаётся пустой.
                .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/register", "/api/auth/login").permitAll()
                        // Экономику игры правит только администратор; читать конфиг
                        // нужно всем — на нём построены пороги уровней и инфографика.
                        .requestMatchers(HttpMethod.PUT, "/api/config").hasRole("ADMIN")
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/dev/**").hasRole("ADMIN")
                        .requestMatchers("/h2-console/**").hasRole("ADMIN")
                        .requestMatchers("/api/**").authenticated()
                        // Тики коэффициента — тоже данные раунда, анониму они не нужны.
                        .requestMatchers("/ws/**").authenticated()
                        .anyRequest().permitAll())
                /*
                  Без этого Spring отвечает на неавторизованный запрос редиректом
                  на форму входа, и фронт получает HTML вместо JSON с ошибкой.
                */
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint((request, response, e) ->
                                writeError(response, HttpServletResponse.SC_UNAUTHORIZED,
                                        "UNAUTHORIZED", "Требуется вход в аккаунт"))
                        .accessDeniedHandler((request, response, e) ->
                                writeError(response, HttpServletResponse.SC_FORBIDDEN,
                                        "FORBIDDEN", "Недостаточно прав")))
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .logout(logout -> logout.disable());

        return http.build();
    }

    /** Тот же формат ошибки, что у ApiExceptionHandler: {"error": ..., "message": ...}. */
    private static void writeError(HttpServletResponse response, int status,
                                   String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"error\":\"%s\",\"message\":\"%s\"}".formatted(code, message));
    }
}
