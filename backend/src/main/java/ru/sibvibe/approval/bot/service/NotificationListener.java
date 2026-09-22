package ru.sibvibe.approval.bot.service;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import ru.sibvibe.approval.approval.event.ApprovalRequestedEvent;
import ru.sibvibe.approval.approval.event.DocumentDecidedEvent;
import ru.sibvibe.approval.bot.Notifier;
import ru.sibvibe.approval.bot.config.BotConfiguration;
import ru.sibvibe.approval.organization.event.JoinRequestDecidedEvent;
import ru.sibvibe.approval.organization.event.JoinRequestSubmittedEvent;
import ru.sibvibe.approval.organization.event.MemberJoinedByLinkEvent;
import ru.sibvibe.approval.organization.service.InviteLinks;
import ru.sibvibe.approval.organization.service.NotificationDirectoryService;
import ru.sibvibe.approval.organization.service.NotificationDirectoryService.Recipient;

import java.util.Map;

/**
 * Единственный подписчик доменных событий {@code organization} и {@code approval} (ARCHITECTURE.md,
 * «Уведомления»): {@code organization} и {@code approval} не вызывают {@code bot} напрямую, а публикуют
 * события - здесь они превращаются в сообщения через {@link Notifier}.
 *
 * {@code @TransactionalEventListener(phase = AFTER_COMMIT)} обязателен: уведомление должно уйти только
 * после того, как изменение действительно сохранилось, иначе оно придёт по операции, которая откатится.
 *
 * {@code @Async} обязателен не меньше (PR #70, замечание №1): без него слушатель выполняется в потоке
 * исходного HTTP-запроса, и «Отправить на согласование» / «Согласовать» не вернут ответ, пока
 * {@link Notifier} не разошлёт сообщения всем получателям - при недоступном Bot API это выглядело бы
 * как зависший основной сценарий (гейт №2, CLAUDE.md). Каждый метод читает получателей из базы в своей
 * отдельной {@code readOnly}-транзакции ({@link NotificationDirectoryService}) - у слушателя к этому
 * моменту исходной транзакции уже нет (AFTER_COMMIT), а на новом потоке её и не было.
 */
@Component
public class NotificationListener {

    private static final String OPEN = "Открыть";
    private static final String OPEN_DOCUMENT = "Открыть документ";

    private final Notifier notifier;
    private final NotificationDirectoryService directory;
    private final InviteLinks links;

    public NotificationListener(Notifier notifier, NotificationDirectoryService directory, InviteLinks links) {
        this.notifier = notifier;
        this.directory = directory;
        this.links = links;
    }

    /** Подана заявка на вступление - уведомляются все активные администраторы компании. */
    @Async(BotConfiguration.NOTIFICATION_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(JoinRequestSubmittedEvent event) {
        String applicantName = directory.find(event.applicantUserId())
                .map(Recipient::displayName)
                .orElse("Новый сотрудник");
        String text = "Новая заявка на вступление от " + applicantName + ".";
        directory.activeAdmins(event.orgId())
                .forEach(admin -> notifier.send(admin.maxUserId(), text, OPEN, links.appLink()));
    }

    /** По заявке принято решение - уведомляется заявитель. */
    @Async(BotConfiguration.NOTIFICATION_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(JoinRequestDecidedEvent event) {
        directory.find(event.applicantUserId()).ifPresent(applicant -> {
            String text = event.approved()
                    ? "Ваша заявка на вступление в компанию одобрена. Добро пожаловать!"
                    : "Ваша заявка на вступление в компанию отклонена.";
            notifier.send(applicant.maxUserId(), text, OPEN, links.appLink());
        });
    }

    /**
     * Человек вступил по личной ссылке без заявки - уведомляется администратор, создавший ссылку
     * (CLAUDE.md, «Личное приглашение — это предъявительский токен»). Одна кнопка «Исключить» в самом
     * уведомлении не сделана: это самостоятельное административное действие вне сессии MAX, которое
     * нельзя безопасно подписать чужой initData - исключить можно из экрана участников за одно нажатие.
     */
    @Async(BotConfiguration.NOTIFICATION_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(MemberJoinedByLinkEvent event) {
        directory.find(event.invitedByUserId()).ifPresent(admin -> {
            String memberName = directory.find(event.userId())
                    .map(Recipient::displayName)
                    .orElse("Новый участник");
            String text = "По вашей личной ссылке в компанию вступил(а): " + memberName + ".";
            notifier.send(admin.maxUserId(), text, OPEN, links.appLink());
        });
    }

    /** Этап согласования стал активным - уведомляются все его согласующие. */
    @Async(BotConfiguration.NOTIFICATION_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(ApprovalRequestedEvent event) {
        String text = "Документ ждёт вашего решения.";
        String url = links.documentLink(event.documentId());
        Map<Long, Recipient> approvers = directory.find(event.approverUserIds());
        approvers.values().forEach(approver -> notifier.send(approver.maxUserId(), text, OPEN_DOCUMENT, url));
    }

    /** По документу принято итоговое решение - уведомляется автор. */
    @Async(BotConfiguration.NOTIFICATION_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(DocumentDecidedEvent event) {
        String text = switch (event.outcome()) {
            case APPROVED -> "Документ согласован.";
            case RETURNED -> "Документ возвращён на доработку.";
            case REJECTED -> "Документ отклонён.";
        };
        directory.find(event.authorUserId()).ifPresent(author ->
                notifier.send(author.maxUserId(), text, OPEN_DOCUMENT, links.documentLink(event.documentId())));
    }
}
