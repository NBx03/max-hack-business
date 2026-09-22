package ru.sibvibe.approval.organization.service;

import org.springframework.stereotype.Component;

/**
 * Ссылки на мини-приложение: {@code https://max.ru/<бот>?startapp=<префикс>_<значение>}.
 * Бота создали организаторы, его ник проверен запросом {@code GET /me} (CLAUDE.md).
 * Используется и приглашениями, и уведомлениями бота (модуль {@code bot} вызывает только сервисы
 * {@code organization} - ARCHITECTURE.md, раздел 2).
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

    /** Префикс {@code d_} - карточка документа из уведомления бота (API_CONTRACTS.md). */
    public String documentLink(long documentId) {
        return link("d_" + documentId);
    }

    /** Без startParam - для ответов бота вне какого-либо конкретного контекста ({@code /start}, приветствие). */
    public String appLink() {
        return "https://max.ru/" + BOT_USERNAME;
    }

    private String link(String payload) {
        return appLink() + "?startapp=" + payload;
    }
}
