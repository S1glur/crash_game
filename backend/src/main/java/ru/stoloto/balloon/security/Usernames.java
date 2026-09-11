package ru.stoloto.balloon.security;

import java.util.Locale;
import java.util.regex.Pattern;

/** Правила логина. Вынесены отдельно, чтобы регистрация и вход нормализовали его одинаково. */
public final class Usernames {

    /** Только латиница: логин печатают вручную, и кириллица здесь — источник неотличимых опечаток. */
    private static final Pattern ALLOWED = Pattern.compile("[a-z0-9_-]{3,20}");

    private Usernames() {
    }

    public static String normalize(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }

    public static boolean isValid(String normalized) {
        return ALLOWED.matcher(normalized).matches();
    }
}
