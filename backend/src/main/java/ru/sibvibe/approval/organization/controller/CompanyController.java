package ru.sibvibe.approval.organization.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import ru.sibvibe.approval.common.dto.RoleRef;
import ru.sibvibe.approval.common.dto.UserRef;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.organization.dto.CreateOrganizationRequest;
import ru.sibvibe.approval.organization.dto.OrganizationCreatedResponse;
import ru.sibvibe.approval.organization.dto.RoleNameRequest;
import ru.sibvibe.approval.organization.service.CompanyService;
import ru.sibvibe.approval.organization.service.RoleService;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class CompanyController {

    private final CompanyService companyService;
    private final RoleService roleService;

    public CompanyController(CompanyService companyService, RoleService roleService) {
        this.companyService = companyService;
        this.roleService = roleService;
    }

    /** Создаёт компанию от имени реальной личности: демо-участник компанию создать не может. */
    @PostMapping("/orgs")
    @ResponseStatus(HttpStatus.CREATED)
    public OrganizationCreatedResponse create(
            @AuthenticationPrincipal CurrentUser currentUser,
            @Valid @RequestBody CreateOrganizationRequest request
    ) {
        return companyService.create(currentUser.authenticatedUser().id(), request);
    }

    @GetMapping("/orgs/current/roles")
    public List<RoleRef> roles(@AuthenticationPrincipal CurrentUser currentUser) {
        return roleService.list(currentUser);
    }

    @PostMapping("/orgs/current/roles")
    @ResponseStatus(HttpStatus.CREATED)
    public RoleRef createRole(
            @AuthenticationPrincipal CurrentUser currentUser,
            @Valid @RequestBody RoleNameRequest request
    ) {
        return roleService.create(currentUser, request.name());
    }

    @PatchMapping("/orgs/current/roles/{id}")
    public RoleRef renameRole(
            @AuthenticationPrincipal CurrentUser currentUser,
            @PathVariable long id,
            @Valid @RequestBody RoleNameRequest request
    ) {
        return roleService.rename(currentUser, id, request.name());
    }

    @GetMapping("/orgs/current/roles/{id}/members")
    public List<UserRef> roleCarriers(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable long id) {
        return roleService.carriers(currentUser, id);
    }
}
