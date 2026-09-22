package ru.sibvibe.approval.bot.adapter;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.client.RestClient;

import java.util.List;

/**
 * Тонкий HTTP-клиент MAX Bot API (https://github.com/max-messenger/api-schema, сверено 2026-09-22).
 * Токен передаётся заголовком {@code Authorization} без префикса «Bearer» - настраивается в
 * {@link ru.sibvibe.approval.bot.config.BotConfiguration}. Методы бросают исключение при ошибке HTTP;
 * решение, что делать с ошибкой (залогировать и продолжить или повторить), принимает вызывающий код -
 * этот класс сам ничего не решает и ничего не знает про домен приложения.
 *
 * Два {@link RestClient} с разными тайм-аутами (PR #70, замечание №1): {@code restClient} - короткий
 * (connect 5 с, read 10 с) для {@code sendMessage}/{@code subscribe}/{@code GET /me}, вызываемых из
 * обработки обычного запроса; {@code pollingRestClient} - долгий read timeout только для
 * {@code GET /updates}, где MAX сам держит соединение до 90 с. Общий клиент с долгим тайм-аутом на
 * отправку означал бы, что медленный или недоступный Bot API держит ответ пользователю мини-аппа.
 */
public class MaxBotApiClient {

    private final RestClient restClient;
    private final RestClient pollingRestClient;

    public MaxBotApiClient(RestClient restClient, RestClient pollingRestClient) {
        this.restClient = restClient;
        this.pollingRestClient = pollingRestClient;
    }

    /** Отправляет сообщение пользователю в личный диалог с ботом. */
    public void sendMessage(long userId, String text, List<LinkButtonRequest> buttons) {
        List<AttachmentRequest> attachments = buttons.isEmpty()
                ? null
                : List.of(new AttachmentRequest("inline_keyboard", new KeyboardPayload(List.of(buttons))));
        restClient.post()
                .uri(uriBuilder -> uriBuilder.path("/messages").queryParam("user_id", userId).build())
                .body(new MessageBody(text, attachments))
                .retrieve()
                .toBodilessEntity();
    }

    /**
     * Получение обновлений long polling'ом. Сервер держит соединение до {@code timeoutSeconds}
     * (не суитаблен для продакшена - документация MAX прямо об этом предупреждает, поэтому метод
     * используется только при {@code max.bot.update-mode=polling}).
     *
     * @param marker маркер предыдущей страницы; {@code null} для первого вызова
     */
    public UpdatesPage getUpdates(Long marker, int timeoutSeconds) {
        UpdatesPage page = pollingRestClient.get()
                .uri(uriBuilder -> {
                    uriBuilder.path("/updates")
                            .queryParam("timeout", timeoutSeconds)
                            .queryParam("types", "message_created,bot_started");
                    if (marker != null) {
                        uriBuilder.queryParam("marker", marker);
                    }
                    return uriBuilder.build();
                })
                .retrieve()
                .body(UpdatesPage.class);
        return page == null ? new UpdatesPage(List.of(), null) : page;
    }

    /** Подписывает бота на приём событий webhook'ом (только на стенде, {@code update-mode=webhook}). */
    public void subscribe(String url, String secret) {
        restClient.post()
                .uri("/subscriptions")
                .body(new SubscribeRequest(url, List.of("message_created", "bot_started"),
                        secret == null || secret.isBlank() ? null : secret))
                .retrieve()
                .toBodilessEntity();
    }

    /** {@code GET /me} - используется только для ручной проверки токена (CONTRIBUTING.md, раздел «Бот»), не в рантайме. */
    public String getMyUsername() {
        JsonNode node = restClient.get().uri("/me").retrieve().body(JsonNode.class);
        return node == null || node.get("username") == null ? null : node.get("username").asText(null);
    }

    /** Страница обновлений {@code GET /updates}: {@code updates} - как есть, разбор - в {@code bot.service}. */
    public record UpdatesPage(List<JsonNode> updates, Long marker) {
        public UpdatesPage {
            updates = updates == null ? List.of() : List.copyOf(updates);
        }
    }

    record MessageBody(String text, List<AttachmentRequest> attachments) {
    }

    record AttachmentRequest(String type, KeyboardPayload payload) {
    }

    record KeyboardPayload(List<List<LinkButtonRequest>> buttons) {
    }

    /** Кнопка типа {@code link}: по нажатию пользователь переходит по ссылке (открывает мини-приложение). */
    public record LinkButtonRequest(String type, String text, String url) {
        public static LinkButtonRequest link(String label, String url) {
            return new LinkButtonRequest("link", label, url);
        }
    }

    record SubscribeRequest(String url, @JsonProperty("update_types") List<String> updateTypes, String secret) {
    }
}
