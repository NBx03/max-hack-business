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
import ru.sibvibe.approval.organization.dto.MemberView;
import ru.sibvibe.approval.organization.service.MemberService;
import ru.sibvibe.approval.organization.service.RoleService;
import ru.sibvibe.approval.organization.service.RouteTemplateService;
import ru.sibvibe.approval.organization.dto.RouteMandatoryRequest;
import ru.sibvibe.approval.organization.dto.RouteOverview;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class CompanyController {

    private final CompanyService companyService;
    private final RoleService roleService;
    private final MemberService memberService;
    private final RouteTemplateService routeTemplates;

    public CompanyController(
            CompanyService companyService,
            RoleService roleService,
            MemberService memberService,
            RouteTemplateService routeTemplates
    ) {
        this.companyService = companyService;
        this.roleService = roleService;
        this.memberService = memberService;
        this.routeTemplates = routeTemplates;
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

    /** Сотрудники своей компании — любому участнику (раздел «Компания»); управление — /orgs/current/members. */
    @GetMapping("/orgs/current/colleagues")
    public List<MemberView> colleagues(@AuthenticationPrincipal CurrentUser currentUser) {
        return memberService.colleagues(currentUser);
    }

    /** Маршруты согласования своей компании по типам документов — любому участнику, только чтение. */
    @GetMapping("/orgs/current/routes")
    public List<RouteOverview> routes(@AuthenticationPrincipal CurrentUser currentUser) {
        return routeTemplates.overview(currentUser);
    }

    /** #109: администратор делает роль в шаблоне вида документа обязательной или нет. */
    @PatchMapping("/orgs/current/routes/{documentTypeId}/roles/{roleId}")
    public List<RouteOverview> setRouteRoleMandatory(
            @AuthenticationPrincipal CurrentUser currentUser,
            @PathVariable long documentTypeId,
            @PathVariable long roleId,
            @Valid @RequestBody RouteMandatoryRequest request
    ) {
        return routeTemplates.setMandatory(currentUser, documentTypeId, roleId, request.mandatory());
    }

    @GetMapping("/orgs/current/roles/{id}/members")
    public List<UserRef> roleCarriers(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable long id) {
        return roleService.carriers(currentUser, id);
    }
}
