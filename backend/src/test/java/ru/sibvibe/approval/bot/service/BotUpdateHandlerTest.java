package ru.sibvibe.approval.bot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import ru.sibvibe.approval.bot.Notifier;
import ru.sibvibe.approval.document.DocumentLookup;
import ru.sibvibe.approval.organization.service.InviteLinks;
import ru.sibvibe.approval.organization.service.NotificationDirectoryService;
import ru.sibvibe.approval.organization.service.NotificationDirectoryService.Membership;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code /start} - кнопка открытия мини-приложения (issue #19). Любое другое сообщение - сначала
 * поиск документа по названию (issue #74), иначе тот же ответ, что и раньше. Одинаковая логика для
 * long polling и webhook - см. {@link BotUpdateHandler}.
 */
class BotUpdateHandlerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String APP_LINK = "https://max.ru/t354_hakaton_max_bot";
    private static final String DOCUMENT_LINK = "https://max.ru/t354_hakaton_max_bot?startapp=d_500";

    private final Notifier notifier = mock(Notifier.class);
    private final InviteLinks links = mock(InviteLinks.class);
    private final NotificationDirectoryService directory = mock(NotificationDirectoryService.class);
    private final DocumentLookup documents = mock(DocumentLookup.class);
    private final BotUpdateHandler handler = new BotUpdateHandler(notifier, links, directory, documents);

    @Test
    void botStartedRepliesToTheUserWhoPressedStart() throws Exception {
        when(links.appLink()).thenReturn(APP_LINK);
        JsonNode update = json("""
                { "update_type": "bot_started", "timestamp": 1, "chat_id": 55,
                  "user": { "user_id": 910000042, "first_name": "Иван", "is_bot": false } }
                """);

        handler.handle(update);

        verify(notifier).send(eq(910000042L), anyString(), anyString(), eq(APP_LINK));
    }

    @Test
    void messageFromSomeoneOutsideAnyCompanyGetsTheOpenAppButton() throws Exception {
        when(links.appLink()).thenReturn(APP_LINK);
        when(directory.findRealMembershipByMaxUserId(910000042L)).thenReturn(Optional.empty());

        handler.handle(message("Привет"));

        verify(notifier).send(eq(910000042L), anyString(), anyString(), eq(APP_LINK));
        verify(documents, never()).findByTitleFragment(anyLong(), anyLong(), anyString(), anyInt());
    }

    @Test
    void messageWithNoTitleMatchGetsTheOpenAppButton() throws Exception {
        when(links.appLink()).thenReturn(APP_LINK);
        when(directory.findRealMembershipByMaxUserId(910000042L)).thenReturn(Optional.of(new Membership(7L, 1L)));
        when(documents.findByTitleFragment(1L, 7L, "Договор аренды", 5)).thenReturn(List.of());

        handler.handle(message("Договор аренды"));

        verify(notifier).send(eq(910000042L), anyString(), anyString(), eq(APP_LINK));
    }

    @Test
    void messageMatchingExactlyOneDocumentRepliesWithStatusStageAndCardButton() throws Exception {
        when(directory.findRealMembershipByMaxUserId(910000042L)).thenReturn(Optional.of(new Membership(7L, 1L)));
        when(documents.findByTitleFragment(1L, 7L, "ноутбук", 5)).thenReturn(
                List.of(new DocumentLookup.Match(500L, "Закупка ноутбуков", "IN_APPROVAL", 2)));
        when(links.documentLink(500L)).thenReturn(DOCUMENT_LINK);

        handler.handle(message("ноутбук"));

        org.mockito.ArgumentCaptor<String> text = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(notifier).send(eq(910000042L), text.capture(), anyString(), eq(DOCUMENT_LINK));
        assertThat(text.getValue()).contains("Закупка ноутбуков").contains("этап 2");
    }

    @Test
    void messageMatchingSeveralDocumentsListsThemWithoutAButton() throws Exception {
        when(links.appLink()).thenReturn(APP_LINK);
        when(directory.findRealMembershipByMaxUserId(910000042L)).thenReturn(Optional.of(new Membership(7L, 1L)));
        when(documents.findByTitleFragment(1L, 7L, "заявление", 5)).thenReturn(List.of(
                new DocumentLookup.Match(500L, "Заявление на отпуск", "APPROVED", null),
                new DocumentLookup.Match(501L, "Заявление на командировку", "DRAFT", null)));

        handler.handle(message("заявление"));

        org.mockito.ArgumentCaptor<String> text = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(notifier).send(eq(910000042L), text.capture(), anyString(), eq(APP_LINK));
        assertThat(text.getValue()).contains("Заявление на отпуск").contains("Заявление на командировку");
    }

    /**
     * Ручной {@code /start} (не нажатие «Начать» - тогда пришёл бы {@code bot_started}) приходит как
     * обычное сообщение. Без этой проверки участник компании получил бы «Не нашёл документ» на первое
     * же слово, с которого может начаться проверка бота (PR #83, ревью, блокирующее замечание).
     */
    @Test
    void slashCommandsTypedAsMessagesGetTheGreetingNotADocumentSearch() throws Exception {
        when(links.appLink()).thenReturn(APP_LINK);
        when(directory.findRealMembershipByMaxUserId(910000042L)).thenReturn(Optional.of(new Membership(7L, 1L)));

        handler.handle(message("/start"));

        verify(notifier).send(eq(910000042L), anyString(), anyString(), eq(APP_LINK));
        verify(documents, never()).findByTitleFragment(anyLong(), anyLong(), anyString(), anyInt());
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

    private JsonNode message(String text) throws Exception {
        return json("""
                { "update_type": "message_created", "timestamp": 1,
                  "message": { "timestamp": 1, "recipient": { "chat_id": 55, "chat_type": "dialog" },
                    "body": { "mid": "1", "seq": 1, "text": "%s" },
                    "sender": { "user_id": 910000042, "first_name": "Иван", "is_bot": false } } }
                """.formatted(text));
    }

    private JsonNode json(String raw) throws Exception {
        return MAPPER.readTree(raw);
    }
}
