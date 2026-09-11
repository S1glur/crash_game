package ru.stoloto.balloon.api;

/** Ошибка домена с кодом из контракта (docs/api.md). */
public class ApiException extends RuntimeException {

    private final String code;

    public ApiException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
