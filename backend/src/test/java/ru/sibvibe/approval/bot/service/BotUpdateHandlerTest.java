package ru.sibvibe.approval.bot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import ru.sibvibe.approval.bot.Notifier;
import ru.sibvibe.approval.organization.service.InviteLinks;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code /start} и любое сообщение боту - кнопка открытия мини-приложения (issue #19).
 * Одинаковая логика для long polling и webhook - см. {@link BotUpdateHandler}.
 */
class BotUpdateHandlerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Notifier notifier = mock(Notifier.class);
    private final InviteLinks links = mock(InviteLinks.class);
    private final BotUpdateHandler handler = new BotUpdateHandler(notifier, links);

    @Test
    void botStartedRepliesToTheUserWhoPressedStart() throws Exception {
        when(links.appLink()).thenReturn("https://max.ru/t354_hakaton_max_bot");
        JsonNode update = json("""
                { "update_type": "bot_started", "timestamp": 1, "chat_id": 55,
                  "user": { "user_id": 910000042, "first_name": "Иван", "is_bot": false } }
                """);

        handler.handle(update);

        verify(notifier).send(eq(910000042L), anyString(), anyString(), eq("https://max.ru/t354_hakaton_max_bot"));
    }

    @Test
    void anyMessageFromAHumanGetsTheOpenAppButton() throws Exception {
        when(links.appLink()).thenReturn("https://max.ru/t354_hakaton_max_bot");
        JsonNode update = json("""
                { "update_type": "message_created", "timestamp": 1,
                  "message": { "timestamp": 1, "recipient": { "chat_id": 55, "chat_type": "dialog" },
                    "body": { "mid": "1", "seq": 1, "text": "Привет" },
                    "sender": { "user_id": 910000042, "first_name": "Иван", "is_bot": false } } }
                """);

        handler.handle(update);

        verify(notifier).send(eq(910000042L), anyString(), anyString(), eq("https://max.ru/t354_hakaton_max_bot"));
    }

    @Test
    void messagesFromBotsAreIgnoredToAvoidLoops() throws Exception {
        JsonNode update = json("""
                { "update_type": "message_created", "timestamp": 1,
                  "message": { "timestamp": 1, "recipient": { "chat_id": 55, "chat_type": "dialog" },
                    "body": { "mid": "1", "seq": 1, "text": "Ответ" },
                    "sender": { "user_id": 1, "first_name": "Бот", "is_bot": true } } }
                """);

        handler.handle(update);

        verify(notifier, never()).send(anyLong(), anyString(), anyString(), anyString());
    }

    @Test
    void unknownUpdateTypesAreIgnored() throws Exception {
        JsonNode update = json("""
                { "update_type": "chat_title_changed", "timestamp": 1, "chat_id": 55,
                  "user": { "user_id": 910000042, "first_name": "Иван", "is_bot": false }, "title": "Новое" }
                """);

        handler.handle(update);

        verify(notifier, never()).send(anyLong(), anyString(), anyString(), anyString());
    }

    private JsonNode json(String raw) throws Exception {
        return MAPPER.readTree(raw);
    }
}
