package ru.sibvibe.approval.organization.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.organization.dto.CreateOrganizationRequest;
import ru.sibvibe.approval.organization.dto.OrganizationCreatedResponse;
import ru.sibvibe.approval.organization.entity.Organization;
import ru.sibvibe.approval.organization.entity.Role;
import ru.sibvibe.approval.organization.repository.AppUserRepository;
import ru.sibvibe.approval.organization.repository.OrganizationRepository;
import ru.sibvibe.approval.organization.repository.RoleRepository;

import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Создание компании: создатель — администратор с ролью «Директор», роли и маршруты — по умолчанию. */
@Service
public class CompanyService {

    private final AppUserRepository userRepository;
    private final OrganizationRepository organizationRepository;
    private final RoleRepository roleRepository;
    private final MemberService memberService;
    private final InviteService inviteService;
    private final RouteTemplateService routeTemplateService;
    private final Clock clock;

    public CompanyService(
            AppUserRepository userRepository,
            OrganizationRepository organizationRepository,
            RoleRepository roleRepository,
            MemberService memberService,
            InviteService inviteService,
            RouteTemplateService routeTemplateService,
            Clock clock
    ) {
        this.userRepository = userRepository;
        this.organizationRepository = organizationRepository;
        this.roleRepository = roleRepository;
        this.memberService = memberService;
        this.inviteService = inviteService;
        this.routeTemplateService = routeTemplateService;
        this.clock = clock;
    }

    /**
     * Всё в одной транзакции: компания либо создаётся целиком, либо не создаётся вовсе.
     * Строка пользователя блокируется, чтобы две одновременные попытки не создали две компании.
     *
     * @param userId реальная личность, а не демо-участник: демо-персонаж компанию не создаёт
     */
    @Transactional
    public OrganizationCreatedResponse create(long userId, CreateOrganizationRequest request) {
        userRepository.findByIdForUpdate(userId).orElseThrow(OrganizationErrors::notFound);
        memberService.requireCanOnboard(userId);

        Organization org = new Organization();
        org.setName(request.name().trim());
        org.setInn(blankToNull(request.inn()));
        org.setCreatedBy(userId);
        org.setCreatedAt(clock.instant());
        org.setDemo(false);
        org = organizationRepository.save(org);

        Map<String, Long> roleIdsByCode = new HashMap<>();
        for (DefaultRoles.Seed seed : DefaultRoles.ALL) {
            Role role = new Role();
            role.setOrgId(org.getId());
            role.setCode(seed.code());
            role.setName(seed.name());
            roleIdsByCode.put(seed.code(), roleRepository.save(role).getId());
        }

        memberService.addMember(org, userId, List.of(roleIdsByCode.get(DefaultRoles.DIRECTOR)), true, userId);
        inviteService.issueOrgCode(org.getId(), userId);
        routeTemplateService.createDefaultRoutes(org.getId(), roleIdsByCode);
        return new OrganizationCreatedResponse(org.getId(), org.getName());
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
