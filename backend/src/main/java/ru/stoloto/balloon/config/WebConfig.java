package ru.stoloto.balloon.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** CORS для dev-режима: фронт поднимается на Vite (5173), бэк — на 8080. */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("http://localhost:*", "http://127.0.0.1:*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                // Без этого браузер не приложит сессионную куку к запросу с другого
                // порта, и вход работал бы только через прокси Vite.
                .allowCredentials(true);
    }
}
