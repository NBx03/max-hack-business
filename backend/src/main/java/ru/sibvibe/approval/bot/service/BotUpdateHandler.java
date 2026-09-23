package ru.sibvibe.approval.bot.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import ru.sibvibe.approval.bot.Notifier;
import ru.sibvibe.approval.document.DocumentLookup;
import ru.sibvibe.approval.organization.service.InviteLinks;
import ru.sibvibe.approval.organization.service.NotificationDirectoryService;
import ru.sibvibe.approval.organization.service.NotificationDirectoryService.Membership;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Обрабатывает одно входящее обновление MAX Bot API - общая логика для long polling
 * ({@link BotUpdatePoller}) и webhook ({@code BotWebhookController}), чтобы поведение бота не зависело
 * от режима приёма событий.
 *
 * {@code /start} - кнопка открытия мини-приложения (issue #19). Любое другое сообщение (issue #74)
 * сначала пробуется как поиск документа по названию среди видимых отправителю в его реальной компании
 * (не в демо-песочнице - у входящего сообщения нет и не может быть {@code X-Demo-Act-As}); не нашли
 * совпадений - «не нашёл». Поиск обещаем только тем, кому он доступен: участнику реальной компании.
 * Остальным (без компании, в том числе проверяющему в демо-песочнице) бот объясняет, что поиск - для
 * сотрудников, и предлагает мини-приложение: иначе на название приходило бы то же приветствие с тем же
 * обещанием, и бот выглядел бы зависшим (ревью #83, #50).
 */
@Component
public class BotUpdateHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(BotUpdateHandler.class);
    private static final String GREETING = "Здравствуйте! Здесь готовятся и согласуются документы компании.";
    private static final String GREETING_MEMBER = GREETING + " Напишите часть названия документа — пришлю его статус.";
    private static final String GREETING_GUEST = GREETING + " Откройте мини-приложение: создайте компанию, "
            + "вступите по коду или попробуйте демо-компанию.";
    private static final String MEMBERS_ONLY = "Статус документа по названию доступен сотрудникам компании. "
            + "Откройте мини-приложение: там можно создать компанию, вступить по коду или открыть демо-компанию.";
    private static final String OPEN_BUTTON = "Открыть мини-приложение";
    private static final String OPEN_DOCUMENT = "Открыть документ";
    private static final String NOT_FOUND = "Не нашёл документ с таким названием. "
            + "Напишите часть названия точнее или откройте мини-приложение.";

    /** Больше - неудобно читать одним сообщением в мессенджере, меньше - можно не найти нужный. */
    private static final int SEARCH_LIMIT = 5;

    private static final Map<String, String> STATUS_LABELS = Map.of(
            "DRAFT", "черновик",
            "IN_APPROVAL", "на согласовании",
            "APPROVED", "согласован",
            "RETURNED", "возвращён",
            "REJECTED", "отклонён");

    private final Notifier notifier;
    private final InviteLinks links;
    private final NotificationDirectoryService directory;
    private final DocumentLookup documents;

    public BotUpdateHandler(
            Notifier notifier,
            InviteLinks links,
            NotificationDirectoryService directory,
            DocumentLookup documents
    ) {
        this.notifier = notifier;
        this.links = links;
        this.directory = directory;
        this.documents = documents;
    }

    public void handle(JsonNode update) {
        if (update == null || update.isMissingNode()) {
            return;
        }
        String type = update.path("update_type").asText("");
        switch (type) {
            case "bot_started" -> {
                Long userId = userId(update.path("user"));
                if (userId != null) {
                    greet(userId, membership(userId));
                }
            }
            case "message_created" -> handleMessage(update.path("message"));
            default -> {
                // Реакции на кнопки, системные события чата и т. д. - вне чек-листа задачи, игнорируем.
            }
        }
    }

    private void handleMessage(JsonNode message) {
        JsonNode sender = message.path("sender");
        if (sender.path("is_bot").asBoolean(false)) {
            return; // не отвечаем самому себе / другим ботам - иначе зацикливание
        }
        Long userId = userId(sender);
        if (userId == null) {
            return;
        }
        LOGGER.debug("Сообщение боту от пользователя {}", userId);
        String text = message.path("body").path("text").asText("").strip();
        // Слэш-команда (/start, /help, набранные вручную, а не нажатием "Начать" - тогда пришёл бы
        // bot_started) - это не название документа. Без проверки первый же ручной /start участника
        // компании получил бы «Не нашёл документ» вместо приветствия (PR #83, ревью, блокирующее).
        Optional<Membership> membership = membership(userId);
        if (text.isEmpty() || text.startsWith("/")) {
            greet(userId, membership);
        } else if (membership.isEmpty()) {
            notifier.send(userId, MEMBERS_ONLY, OPEN_BUTTON, links.appLink());
        } else {
            replyWithDocumentStatus(userId, membership.get(), text);
        }
    }

    private Optional<Membership> membership(long maxUserId) {
        return directory.findRealMembershipByMaxUserId(maxUserId);
    }

    private void greet(long userId, Optional<Membership> membership) {
        notifier.send(userId, membership.isPresent() ? GREETING_MEMBER : GREETING_GUEST, OPEN_BUTTON, links.appLink());
    }

    private void replyWithDocumentStatus(long maxUserId, Membership membership, String text) {
        List<DocumentLookup.Match> matches = documents.findByTitleFragment(
                membership.orgId(), membership.userId(), text, SEARCH_LIMIT);
        if (matches.isEmpty()) {
            notifier.send(maxUserId, NOT_FOUND, OPEN_BUTTON, links.appLink());
        } else if (matches.size() == 1) {
            DocumentLookup.Match match = matches.get(0);
            notifier.send(maxUserId, statusText(match), OPEN_DOCUMENT, links.documentLink(match.id()));
        } else {
            // Несколько совпадений - список без кнопок (Notifier поддерживает только одну на сообщение),
            // с просьбой уточнить. Кнопка на каждый документ была бы удобнее, но это уже другой контракт
            // Notifier - за рамками SHOULD-задачи (issue #74 просит кнопку только для точного совпадения).
            String listing = matches.stream()
                    .map(match -> "«" + match.title() + "» — " + statusLabel(match))
                    .collect(Collectors.joining("\n"));
            notifier.send(maxUserId, "Нашёл несколько документов:\n" + listing + "\nУточните название.",
                    OPEN_BUTTON, links.appLink());
        }
    }

    private String statusText(DocumentLookup.Match match) {
        return "«" + match.title() + "»: " + statusLabel(match) + ".";
    }

    private String statusLabel(DocumentLookup.Match match) {
        String label = STATUS_LABELS.getOrDefault(match.status(), match.status());
        if ("IN_APPROVAL".equals(match.status()) && match.currentStage() != null) {
            return label + ", этап " + match.currentStage();
        }
        return label;
    }

    private Long userId(JsonNode user) {
        JsonNode id = user.path("user_id");
        return id.isIntegralNumber() ? id.asLong() : null;
    }
}
