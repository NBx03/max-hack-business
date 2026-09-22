package ru.sibvibe.approval.bot.controller;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.sibvibe.approval.bot.service.BotUpdateHandler;

/**
 * Входящие события MAX Bot API на стенде ({@code max.bot.update-mode=webhook}, API_CONTRACTS.md,
 * «Не для фронтенда»). Не для мини-приложения: доступ разрешён без {@code initData} - вызывает сервер
 * MAX, а не наш фронтенд, поэтому эндпоинт открыт в {@code SecurityConfiguration}, а подлинность
 * запроса проверяется секретом подписки {@code X-Max-Bot-Api-Secret} (`SubscriptionRequestBody.secret`
 * в схеме API MAX, https://github.com/max-messenger/api-schema).
 *
 * Отвечает 200 всегда, кроме неверного секрета - MAX повторяет недоставленные обновления, а ошибка
 * обработки одного события не должна превращаться в постоянные повторы.
 */
@RestController
@RequestMapping("/api/v1/bot")
public class BotWebhookController {

    private static final Logger LOGGER = LoggerFactory.getLogger(BotWebhookController.class);
    private static final String SECRET_HEADER = "X-Max-Bot-Api-Secret";

    private final BotUpdateHandler handler;
    private final String expectedSecret;

    public BotWebhookController(
            BotUpdateHandler handler, @Value("${max.bot.webhook-secret:}") String expectedSecret
    ) {
        this.handler = handler;
        this.expectedSecret = expectedSecret;
    }

    @PostMapping("/webhook")
    public ResponseEntity<Void> receive(
            @RequestHeader(value = SECRET_HEADER, required = false) String secret,
            @RequestBody(required = false) JsonNode update
    ) {
        if (!expectedSecret.isBlank() && !expectedSecret.equals(secret)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            handler.handle(update);
        } catch (RuntimeException exception) {
            LOGGER.warn("Ошибка обработки webhook-события бота: {}", exception.getMessage());
        }
        return ResponseEntity.ok().build();
    }
}
