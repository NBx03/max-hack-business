package ru.sibvibe.approval.security.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.organization.service.OrganizationSecurityService;
import ru.sibvibe.approval.security.dto.MeResponse;
import ru.sibvibe.approval.security.dto.RoleRef;
import ru.sibvibe.approval.security.dto.SandboxResponse;
import ru.sibvibe.approval.security.dto.UserRef;

import java.util.List;

/** Формирует ответы сессии, не раскрывая MAX id или внутренние признаки личности. */
@Service
public class SessionViewService {

    private final OrganizationSecurityService organizationService;
    private final boolean demoMode;

    public SessionViewService(
            OrganizationSecurityService organizationService,
            @Value("${app.demo-mode:false}") boolean demoMode
    ) {
        this.organizationService = organizationService;
        this.demoMode = demoMode;
    }

    @Transactional(readOnly = true)
    public MeResponse me(CurrentUser currentUser) {
        long authenticatedId = currentUser.authenticatedUser().id();
        MeResponse.Membership membership = organizationService.findRealMembership(authenticatedId)
                .map(value -> new MeResponse.Membership(
                        value.orgId(), value.orgName(), roles(value.roles()), value.admin()))
                .orElse(null);
        MeResponse.PendingJoinRequest pending = organizationService.findPendingJoin(authenticatedId)
                .map(value -> new MeResponse.PendingJoinRequest(value.id(), value.orgName(), value.createdAt()))
                .orElse(null);
        MeResponse.Sandbox sandbox = demoMode
                ? organizationService.findSandbox(authenticatedId)
                        .map(value -> new MeResponse.Sandbox(value.orgId(), value.orgName()))
                        .orElse(null)
                : null;
        MeResponse.ActingAs actingAs = actingAs(currentUser);
        return new MeResponse(
                new UserRef(authenticatedId, currentUser.authenticatedUser().displayName()),
                membership, pending, demoMode, sandbox, actingAs, currentUser.startParam());
    }

    @Transactional(readOnly = true)
    public SandboxResponse sandbox(long ownerId) {
        return organizationService.findSandbox(ownerId)
                .map(this::sandbox)
                .orElseThrow(ru.sibvibe.approval.common.api.NotFoundException::new);
    }

    @Transactional
    public SandboxResponse resetSandbox(long ownerId) {
        return sandbox(organizationService.resetSandbox(ownerId));
    }

    public boolean demoMode() {
        return demoMode;
    }

    private SandboxResponse sandbox(OrganizationSecurityService.SandboxInfo value) {
        return new SandboxResponse(value.orgId(), value.orgName(), value.users().stream()
                .map(user -> new SandboxResponse.SandboxUser(
                        user(user.user()), roles(user.roles()), user.admin()))
                .toList());
    }

    private UserRef user(OrganizationSecurityService.UserInfo value) {
        return new UserRef(value.id(), value.displayName());
    }

    private MeResponse.ActingAs actingAs(CurrentUser currentUser) {
        if (!currentUser.actingAsDemo()) {
            return null;
        }
        OrganizationSecurityService.SandboxUserInfo value = organizationService.requireSandboxActor(
                currentUser.authenticatedUser().id(), currentUser.userId());
        return new MeResponse.ActingAs(user(value.user()), roles(value.roles()), value.admin());
    }

    private List<RoleRef> roles(List<OrganizationSecurityService.RoleInfo> values) {
        return values.stream().map(value -> new RoleRef(value.id(), value.code(), value.name())).toList();
    }
}
