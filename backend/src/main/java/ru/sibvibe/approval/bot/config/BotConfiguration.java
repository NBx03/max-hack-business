package ru.sibvibe.approval.bot.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.ClientHttpRequestFactorySettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import ru.sibvibe.approval.bot.Notifier;
import ru.sibvibe.approval.bot.adapter.MaxBotApiClient;
import ru.sibvibe.approval.bot.adapter.MaxBotApiNotifier;
import ru.sibvibe.approval.bot.adapter.NoopNotifier;
import ru.sibvibe.approval.bot.service.BotUpdateHandler;
import ru.sibvibe.approval.bot.service.BotUpdatePoller;
import ru.sibvibe.approval.bot.service.BotWebhookSubscriber;

import java.time.Duration;

/**
 * Связывает модуль {@code bot} с настройками {@code max.bot.*} (application.yml). Полностью совпадает
 * с ARCHITECTURE.md, раздел «Порты»: единственная реализация {@link Notifier} на MAX Bot API,
 * {@code adapter/} - единственное место, где виден HTTP-клиент.
 */
@Configuration(proxyBeanMethods = false)
public class BotConfiguration {

    private static final Logger LOGGER = LoggerFactory.getLogger(BotConfiguration.class);

    /** Долгий read timeout - под {@code GET /updates} (long polling держит соединение до 90 с у MAX). */
    @Bean
    RestClient maxBotApiRestClient(
            RestClient.Builder builder,
            @Value("${max.bot.api-url}") String apiUrl,
            @Value("${max.bot.token:}") String token
    ) {
        ClientHttpRequestFactorySettings settings = ClientHttpRequestFactorySettings.defaults()
                .withConnectTimeout(Duration.ofSeconds(10))
                .withReadTimeout(Duration.ofSeconds(100));
        ClientHttpRequestFactory requestFactory = ClientHttpRequestFactoryBuilder.detect().build(settings);
        RestClient.Builder configured = builder.baseUrl(apiUrl).requestFactory(requestFactory);
        if (!token.isBlank()) {
            // Токен - только заголовком Authorization, без "Bearer": параметр access_token сервер отвергает
            // (CLAUDE.md; сверено со схемой https://github.com/max-messenger/api-schema).
            configured.defaultHeader(HttpHeaders.AUTHORIZATION, token);
        }
        return configured.build();
    }

    @Bean
    MaxBotApiClient maxBotApiClient(RestClient maxBotApiRestClient) {
        return new MaxBotApiClient(maxBotApiRestClient);
    }

    @Bean
    Notifier notifier(
            MaxBotApiClient client,
            @Value("${max.bot.token:}") String token,
            @Value("${max.bot.enabled:true}") boolean enabled
    ) {
        if (!enabled) {
            LOGGER.info("max.bot.enabled=false: уведомления MAX будут только в логе");
            return new NoopNotifier();
        }
        if (token.isBlank()) {
            LOGGER.warn("MAX_BOT_TOKEN не задан: уведомления MAX будут только в логе");
            return new NoopNotifier();
        }
        return new MaxBotApiNotifier(client);
    }

    /** Локальная разработка: {@code max.bot.update-mode=polling} (значение по умолчанию). */
    @Bean
    @ConditionalOnProperty(prefix = "max.bot", name = "update-mode", havingValue = "polling", matchIfMissing = true)
    BotUpdatePoller botUpdatePoller(
            MaxBotApiClient client,
            BotUpdateHandler handler,
            @Value("${max.bot.token:}") String token,
            @Value("${max.bot.enabled:true}") boolean enabled
    ) {
        return new BotUpdatePoller(client, handler, enabled && !token.isBlank());
    }

    /** Стенд сдачи: {@code max.bot.update-mode=webhook} - подписывает бота на {@code POST /api/v1/bot/webhook}. */
    @Bean
    @ConditionalOnProperty(prefix = "max.bot", name = "update-mode", havingValue = "webhook")
    BotWebhookSubscriber botWebhookSubscriber(
            MaxBotApiClient client,
            @Value("${max.bot.webhook-url:}") String webhookUrl,
            @Value("${max.bot.webhook-secret:}") String webhookSecret,
            @Value("${max.bot.token:}") String token,
            @Value("${max.bot.enabled:true}") boolean enabled
    ) {
        return new BotWebhookSubscriber(client, webhookUrl, webhookSecret, enabled && !token.isBlank());
    }
}
