package ru.sibvibe.approval.organization.service;

import org.springframework.stereotype.Component;

/**
 * Ссылки-приглашения на мини-приложение: {@code https://max.ru/<бот>?startapp=<префикс>_<значение>}.
 * Бота создали организаторы, его ник проверен запросом {@code GET /me} (CLAUDE.md).
 */
@Component
public class InviteLinks {

    private static final String BOT_USERNAME = "t354_hakaton_max_bot";

    /** Префикс {@code c_} отличает код компании от личной ссылки ({@code p_}) в startParam. */
    public String orgCodeLink(String code) {
        return link("c_" + code);
    }

    public String personalLink(String token) {
        return link("p_" + token);
    }

    private String link(String payload) {
        return "https://max.ru/" + BOT_USERNAME + "?startapp=" + payload;
    }
}
