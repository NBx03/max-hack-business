package ru.sibvibe.approval.approval.event;

import java.util.Set;

/**
 * Этап стал активным: перечисленные согласующие получают уведомление «документ ждёт вашего решения».
 * Публикуется внутри транзакции: слушатель — только {@code @TransactionalEventListener(phase = AFTER_COMMIT)},
 * иначе уведомление уйдёт по операции, которая затем откатится.
 */
public record ApprovalRequestedEvent(
        long documentId,
        int versionNo,
        int stageOrder,
        Set<Long> approverUserIds,
        long authorUserId
) {
    public ApprovalRequestedEvent {
        approverUserIds = Set.copyOf(approverUserIds);
    }
}
