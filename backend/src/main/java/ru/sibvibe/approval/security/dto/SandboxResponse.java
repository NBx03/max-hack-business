package ru.sibvibe.approval.security.dto;

import java.util.List;

public record SandboxResponse(long orgId, String orgName, List<SandboxUser> users) {
    public SandboxResponse {
        users = List.copyOf(users);
    }

    public record SandboxUser(UserRef user, List<RoleRef> roles, boolean isAdmin) {
        public SandboxUser {
            roles = List.copyOf(roles);
        }
    }
}
