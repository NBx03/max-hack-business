package ru.sibvibe.approval.security.dto;

import java.time.Instant;
import java.util.List;

public record MeResponse(
        UserRef user,
        Membership membership,
        PendingJoinRequest pendingJoinRequest,
        boolean demoMode,
        Sandbox sandbox,
        ActingAs actingAs,
        String startParam
) {
    public record Membership(long orgId, String orgName, List<RoleRef> roles, boolean isAdmin) {
        public Membership {
            roles = List.copyOf(roles);
        }
    }

    public record PendingJoinRequest(long id, String orgName, Instant createdAt) {
    }

    public record Sandbox(long orgId, String orgName) {
    }

    public record ActingAs(UserRef user, List<RoleRef> roles, boolean isAdmin) {
        public ActingAs {
            roles = List.copyOf(roles);
        }
    }
}
