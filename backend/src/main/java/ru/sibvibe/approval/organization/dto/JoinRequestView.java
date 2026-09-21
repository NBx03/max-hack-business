package ru.sibvibe.approval.organization.dto;

import ru.sibvibe.approval.common.dto.UserRef;

import java.time.Instant;

public record JoinRequestView(long id, UserRef user, String status, Instant createdAt) {
}
