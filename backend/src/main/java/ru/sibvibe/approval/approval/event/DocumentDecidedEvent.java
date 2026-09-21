package ru.sibvibe.approval.approval.event;

/**
 * По документу принято итоговое решение: автор получает уведомление. {@code deciderUserId} пуст, если документ
 * согласован сразу при отправке (все шаги автосогласованы). Публикуется внутри транзакции: слушатель —
 * только {@code @TransactionalEventListener(phase = AFTER_COMMIT)}.
 */
public record DocumentDecidedEvent(
        long documentId,
        int versionNo,
        long authorUserId,
        Outcome outcome,
        Long deciderUserId
) {
    public enum Outcome { APPROVED, RETURNED, REJECTED }
}
