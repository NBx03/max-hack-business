package ru.sibvibe.approval.bot.adapter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.sibvibe.approval.bot.Notifier;

import java.util.List;

/**
 * {@link Notifier} через настоящий MAX Bot API. Ошибка HTTP-вызова не пробрасывается дальше:
 * уведомление не ушло - записали в лог, действие пользователя, вызвавшее уведомление, уже выполнено
 * и не откатывается (CLAUDE.md, решение E; ARCHITECTURE.md, «Уведомления»).
 */
public class MaxBotApiNotifier implements Notifier {

    private static final Logger LOGGER = LoggerFactory.getLogger(MaxBotApiNotifier.class);

    private final MaxBotApiClient client;

    public MaxBotApiNotifier(MaxBotApiClient client) {
        this.client = client;
    }

    @Override
    public void send(long maxUserId, String text, String buttonLabel, String buttonUrl) {
        List<MaxBotApiClient.LinkButtonRequest> buttons = buttonUrl == null || buttonUrl.isBlank()
                ? List.of()
                : List.of(MaxBotApiClient.LinkButtonRequest.link(buttonLabel, buttonUrl));
        try {
            client.sendMessage(maxUserId, text, buttons);
        } catch (RuntimeException exception) {
            LOGGER.warn("Не удалось отправить уведомление MAX пользователю {}: {}",
                    maxUserId, exception.getMessage());
        }
    }
}
