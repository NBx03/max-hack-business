package ru.sibvibe.approval.bot.service;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import ru.sibvibe.approval.approval.event.ApprovalRequestedEvent;
import ru.sibvibe.approval.approval.event.ApproverRemovedEvent;
import ru.sibvibe.approval.approval.event.DocumentDecidedEvent;
import ru.sibvibe.approval.approval.event.DocumentWithdrawnEvent;
import ru.sibvibe.approval.approval.event.StuckStepReminderEvent;
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
        // Те же слова, что в приложении (NAV-2): раздел «На моём согласовании»; у утверждающего — «утверждения» (D4).
        String text = "«" + event.documentTitle() + "» ждёт вашего " + (event.endorsement() ? "утверждения" : "решения")
                + ". Он в разделе «На моём согласовании».";
        String url = links.documentLink(event.documentId());
        Map<Long, Recipient> approvers = directory.find(event.approverUserIds());
        approvers.values().forEach(approver -> notifier.send(approver.maxUserId(), text, OPEN_DOCUMENT, url));
    }

    /** Автор отозвал документ: тем, чья очередь уже подошла, решение больше не нужно (приёмка 24.09). */
    @Async(BotConfiguration.NOTIFICATION_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(DocumentWithdrawnEvent event) {
        String text = "Автор отозвал документ «" + event.documentTitle() + "» с согласования. Решение по нему больше не нужно.";
        directory.find(event.waitingApproverIds()).values()
                .forEach(approver -> notifier.send(approver.maxUserId(), text, OPEN_DOCUMENT, links.documentLink(event.documentId())));
    }

    /**
     * Согласующего исключили или сняли с него роль — документ вернулся автору (приёмка 24.09, п. 15). Автору —
     * что делать дальше, тем, чья очередь уже подошла, — что решение больше не нужно.
     */
    @Async(BotConfiguration.NOTIFICATION_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(ApproverRemovedEvent event) {
        String url = links.documentLink(event.documentId());
        String title = "«" + event.documentTitle() + "»";
        String who = directory.find(event.removedUserId()).map(Recipient::displayName).orElse("Согласующий");
        // Без глагола с родом при имени — пол не знаем (как в deciderSuffix).
        String why = event.roleRemoved() ? "больше не согласует его в своей роли" : "больше не в компании";
        directory.find(event.authorUserId()).ifPresent(author -> notifier.send(author.maxUserId(),
                title + " вернулся к вам: " + who + " " + why + ". Отправьте документ заново — если он не менялся, "
                        + "прежние согласования сохранятся.",
                OPEN_DOCUMENT, url));
        String text = title + " снят с согласования: " + who + " " + why + ". Решение по нему пока не нужно.";
        directory.find(event.waitingApproverIds()).values()
                .forEach(approver -> notifier.send(approver.maxUserId(), text, OPEN_DOCUMENT, url));
    }

    /**
     * По документу принято итоговое решение - уведомляется автор, с именем того, кто решил (issue #74).
     * У auto-approve при отправке ({@code deciderUserId == null}, CLAUDE.md, «Решение A», один сотрудник
     * держит единственную обязательную роль) решившего человека нет - суффикс просто не добавляется.
     */
    @Async(BotConfiguration.NOTIFICATION_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(DocumentDecidedEvent event) {
        directory.find(event.authorUserId()).ifPresent(author -> {
            String decider = event.deciderUserId() == null
                    ? null
                    : directory.find(event.deciderUserId()).map(Recipient::displayName).orElse(null);
            String title = "«" + event.documentTitle() + "»";
            String text = switch (event.outcome()) {
                case APPROVED -> title + (event.endorsed() ? " утверждён." : " согласован.") + deciderSuffix(decider);
                case RETURNED -> title + " возвращён на доработку." + deciderSuffix(decider);
                case REJECTED -> title + " отклонён." + deciderSuffix(decider);
            };
            notifier.send(author.maxUserId(), text, OPEN_DOCUMENT, links.documentLink(event.documentId()));
        });
    }

    /**
     * Шаг застрял дольше настроенного порога (issue #60, COULD) - согласующему уходит напоминание с той же
     * кнопкой, что и обычный запрос решения. Отсечение «не чаще раза в сутки на шаг» уже сделано отправителем
     * события ({@code approval.StuckStepReminderJob}, атомарный {@code UPDATE}) - здесь только текст.
     *
     * Текст нейтральный, без подталкивания к конкретному решению (ревью #93, пункт 6): согласующий может
     * не только одобрить, но и вернуть или отклонить документ, а «Не забудьте согласовать» это исключало.
     */
    @Async(BotConfiguration.NOTIFICATION_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(StuckStepReminderEvent event) {
        directory.find(event.approverUserId()).ifPresent(approver -> {
            String text = "«" + event.documentTitle() + "» " + waitingPhrase(event.waitingHours())
                    + " Откройте документ, чтобы принять решение.";
            notifier.send(approver.maxUserId(), text, OPEN_DOCUMENT, links.documentLink(event.documentId()));
        });
    }

    /** Без гендерного глагола при имени (как и в {@link #on(MemberJoinedByLinkEvent)}) - пол не знаем. */
    private static String deciderSuffix(String deciderName) {
        return deciderName == null ? "" : " Решение: " + deciderName + ".";
    }

    /** Часы, пока не набегут сутки, дальше - дни; ноль и меньше округляем вверх до одного часа. */
    private static String waitingPhrase(long waitingHours) {
        long hours = Math.max(waitingHours, 1);
        if (hours < 24) {
            return "ждёт вашего решения уже " + hours + " " + ruPlural(hours, "час", "часа", "часов") + ".";
        }
        long days = hours / 24;
        return "ждёт вашего решения уже " + days + " " + ruPlural(days, "день", "дня", "дней") + ".";
    }

    /** Русское склонение числительного: 1 день, 2-4 дня, 5-20 и *1 дней (11-14 - всегда «дней»). */
    private static String ruPlural(long count, String one, String few, String many) {
        long mod100 = count % 100;
        long mod10 = count % 10;
        if (mod100 >= 11 && mod100 <= 14) {
            return many;
        }
        if (mod10 == 1) {
            return one;
        }
        if (mod10 >= 2 && mod10 <= 4) {
            return few;
        }
        return many;
    }
}
