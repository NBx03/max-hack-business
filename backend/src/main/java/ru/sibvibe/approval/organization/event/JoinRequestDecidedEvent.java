package ru.sibvibe.approval.organization.event;

/** По заявке принято решение: заявитель получает уведомление. */
public record JoinRequestDecidedEvent(long orgId, long joinRequestId, long applicantUserId, boolean approved) {
}
