package ru.sibvibe.approval.bot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import ru.sibvibe.approval.bot.adapter.MaxBotApiClient;

/**
 * На стенде ({@code max.bot.update-mode=webhook}) подписывает бота на приём событий по адресу
 * {@code <MAX_BOT_WEBHOOK_URL>/api/v1/bot/webhook} - без этого шага MAX не знает, куда слать обновления,
 * и бот не отвечает на {@code /start} и сообщения (прямой риск гейта №2, CLAUDE.md).
 *
 * Сбой не должен мешать запуску: подписка - операция стенда, а не основного сценария; повторный
 * запуск бэкенда или ручной вызов {@code POST /subscriptions} (см. CONTRIBUTING.md, раздел «Бот»)
 * поправит дело.
 *
 * <p><b>PR #70, замечание №2.</b> Без секрета не подписываемся вовсе, а не подписываемся с пустым
 * секретом: {@code BotWebhookController} в этом режиме и так всегда отвечает 401 без секрета
 * (fail closed), так что подписка без него была бы бесполезной - webhook принимал бы события,
 * на которые бот никогда не ответит. Это ошибка конфигурации стенда, а не штатная деградация.
 */
public class BotWebhookSubscriber implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(BotWebhookSubscriber.class);
    private static final String WEBHOOK_PATH = "/api/v1/bot/webhook";

    private final MaxBotApiClient client;
    private final String webhookBaseUrl;
    private final String webhookSecret;
    private final boolean tokenConfigured;

    public BotWebhookSubscriber(
            MaxBotApiClient client, String webhookBaseUrl, String webhookSecret, boolean tokenConfigured
    ) {
        this.client = client;
        this.webhookBaseUrl = webhookBaseUrl;
        this.webhookSecret = webhookSecret;
        this.tokenConfigured = tokenConfigured;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!tokenConfigured) {
            LOGGER.warn("MAX_BOT_TOKEN не задан: подписка на webhook не выполнена");
            return;
        }
        if (webhookBaseUrl == null || webhookBaseUrl.isBlank()) {
            LOGGER.warn("MAX_BOT_WEBHOOK_URL не задан: подписку на webhook нужно оформить вручную "
                    + "(CONTRIBUTING.md, раздел «Бот»)");
            return;
        }
        if (webhookSecret == null || webhookSecret.isBlank()) {
            LOGGER.error("MAX_BOT_WEBHOOK_SECRET не задан: подписка на webhook не выполнена, "
                    + "иначе входящие события никто не сможет подтвердить (BotWebhookController)");
            return;
        }
        String url = webhookBaseUrl.replaceAll("/+$", "") + WEBHOOK_PATH;
        try {
            client.subscribe(url, webhookSecret);
            LOGGER.info("Бот подписан на приём событий webhook'ом: {}", url);
        } catch (RuntimeException exception) {
            LOGGER.error("Не удалось подписать бота на webhook {}; приложение продолжает работу", url, exception);
        }
    }
}
