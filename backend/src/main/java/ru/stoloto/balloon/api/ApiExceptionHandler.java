package ru.stoloto.balloon.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/** Единый формат ошибки: {"error": "CODE", "message": "..."} — как в контракте. */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, String>> handle(ApiException e) {
        HttpStatus status = switch (e.getCode()) {
            case "ROUND_NOT_ACTIVE", "ALREADY_CASHED_OUT" -> HttpStatus.CONFLICT;
            default -> HttpStatus.BAD_REQUEST;
        };
        return ResponseEntity.status(status)
                .body(Map.of("error", e.getCode(), "message", e.getMessage()));
    }
}
