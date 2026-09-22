package ru.sibvibe.approval.bot.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import ru.sibvibe.approval.bot.Notifier;
import ru.sibvibe.approval.organization.service.InviteLinks;

/**
 * Обрабатывает одно входящее обновление MAX Bot API - общая логика для long polling
 * ({@link BotUpdatePoller}) и webhook ({@code BotWebhookController}), чтобы поведение бота
 * не зависело от режима приёма событий.
 *
 * MVP: {@code /start} и любое сообщение пользователя боту - кнопка открытия мини-приложения
 * (issue #19). Остальные типы обновлений (реакции на кнопки, системные события чата и т. д.)
 * игнорируются - в чеклисте задачи их нет, а бот работает только в личном диалоге.
 */
@Component
public class BotUpdateHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(BotUpdateHandler.class);
    private static final String GREETING = "Здравствуйте! Здесь готовятся и согласуются документы компании.";
    private static final String OPEN_BUTTON = "Открыть мини-приложение";

    private final Notifier notifier;
    private final InviteLinks links;

    public BotUpdateHandler(Notifier notifier, InviteLinks links) {
        this.notifier = notifier;
        this.links = links;
    }

    public void handle(JsonNode update) {
        if (update == null || update.isMissingNode()) {
            return;
        }
        String type = update.path("update_type").asText("");
        Long userId = switch (type) {
            case "bot_started" -> userId(update.path("user"));
            case "message_created" -> messageSenderId(update.path("message"));
            default -> null;
        };
        if (userId == null) {
            return;
        }
        LOGGER.debug("Обновление MAX Bot API «{}» от пользователя {}", type, userId);
        notifier.send(userId, GREETING, OPEN_BUTTON, links.appLink());
    }

    /** {@code message_created} на сообщения от ботов (включая наш собственный) не отвечаем - иначе зацикливание. */
    private Long messageSenderId(JsonNode message) {
        JsonNode sender = message.path("sender");
        if (sender.path("is_bot").asBoolean(false)) {
            return null;
        }
        return userId(sender);
    }

    private Long userId(JsonNode user) {
        JsonNode id = user.path("user_id");
        return id.isIntegralNumber() ? id.asLong() : null;
    }
}
