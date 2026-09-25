package ru.sibvibe.approval.approval.event;

/**
 * По документу принято итоговое решение: автор получает уведомление. {@code deciderUserId} пуст, если документ
 * согласован сразу при отправке (все шаги автосогласованы). Публикуется внутри транзакции: слушатель —
 * только {@code @TransactionalEventListener(phase = AFTER_COMMIT)}.
 *
 * {@code documentTitle} — см. {@link ApprovalRequestedEvent} (issue #74, ревью #70): название кладёт
 * {@code approval}, а не запрашивает слушатель в {@code bot}.
 */
public record DocumentDecidedEvent(
        long documentId,
        int versionNo,
        long authorUserId,
        Outcome outcome,
        Long deciderUserId,
        String documentTitle,
        /** Итог «Утверждён», а не «Согласован» — последним решал утверждающий (D4). */
        boolean endorsed
) {
    public DocumentDecidedEvent(
            long documentId, int versionNo, long authorUserId, Outcome outcome, Long deciderUserId, String documentTitle
    ) {
        this(documentId, versionNo, authorUserId, outcome, deciderUserId, documentTitle, false);
    }

    public enum Outcome { APPROVED, RETURNED, REJECTED }
}
