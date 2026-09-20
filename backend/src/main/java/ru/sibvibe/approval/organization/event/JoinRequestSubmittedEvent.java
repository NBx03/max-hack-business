package ru.sibvibe.approval.organization.event;

/** Подана заявка на вступление: администраторы компании получают уведомление. */
public record JoinRequestSubmittedEvent(long orgId, long joinRequestId, long applicantUserId) {
}
