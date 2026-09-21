package ru.sibvibe.approval.organization.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.organization.DocumentTypeDirectory;
import ru.sibvibe.approval.organization.entity.ApprovalRoute;
import ru.sibvibe.approval.organization.entity.Organization;
import ru.sibvibe.approval.organization.entity.Role;
import ru.sibvibe.approval.organization.repository.ApprovalRouteRepository;
import ru.sibvibe.approval.organization.repository.OrganizationRepository;
import ru.sibvibe.approval.organization.repository.RoleRepository;

import java.util.HashMap;
import java.util.Map;

/** Шаблоны маршрутов компании: владеет ими организация, а не автор документа. */
@Service
public class RouteTemplateService {

    private final ApprovalRouteRepository routeRepository;
    private final RoleRepository roleRepository;
    private final OrganizationRepository organizationRepository;
    private final DocumentTypeDirectory typeDirectory;

    public RouteTemplateService(
            ApprovalRouteRepository routeRepository,
            RoleRepository roleRepository,
            OrganizationRepository organizationRepository,
            DocumentTypeDirectory typeDirectory
    ) {
        this.routeRepository = routeRepository;
        this.roleRepository = roleRepository;
        this.organizationRepository = organizationRepository;
        this.typeDirectory = typeDirectory;
    }

    /**
     * Добирает маршруты по умолчанию всем настоящим компаниям. Нужен, когда типы документов появляются
     * после компаний (миграция справочника): порядок слияния задач не должен оставлять компании без маршрутов.
     * Идемпотентен; вызывается при старте приложения ({@link RouteBackfillRunner}).
     *
     * @return сколько строк маршрутов создано
     */
    @Transactional
    public int backfillAllOrganizations() {
        int created = 0;
        for (Organization org : organizationRepository.findByDemoFalseOrderById()) {
            created += ensureDefaultRoutes(org.getId());
        }
        return created;
    }

    /**
     * Создаёт маршруты по умолчанию для типов, у которых их ещё нет. Повторный вызов ничего
     * не дублирует, поэтому им можно добрать маршруты после появления новых типов.
     *
     * @return сколько строк маршрутов создано
     */
    @Transactional
    public int ensureDefaultRoutes(long orgId) {
        Map<String, Long> roleIdsByCode = new HashMap<>();
        for (Role role : roleRepository.findByOrgIdOrderById(orgId)) {
            roleIdsByCode.put(role.getCode(), role.getId());
        }
        return createDefaultRoutes(orgId, roleIdsByCode);
    }

    int createDefaultRoutes(long orgId, Map<String, Long> roleIdsByCode) {
        Map<String, Long> typeIds = typeDirectory.idsByCode(DefaultRouteTemplates.typeCodes());
        int created = 0;
        for (Map.Entry<String, java.util.List<DefaultRouteTemplates.Row>> template
                : DefaultRouteTemplates.TEMPLATES.entrySet()) {
            Long typeId = typeIds.get(template.getKey());
            if (typeId == null || routeRepository.existsByOrgIdAndDocumentTypeId(orgId, typeId)) {
                continue;
            }
            for (DefaultRouteTemplates.Row row : template.getValue()) {
                Long roleId = roleIdsByCode.get(row.roleCode());
                if (roleId == null) {
                    continue;
                }
                ApprovalRoute route = new ApprovalRoute();
                route.setOrgId(orgId);
                route.setDocumentTypeId(typeId);
                route.setStageOrder(row.stageOrder());
                route.setRoleId(roleId);
                route.setMandatory(row.mandatory());
                routeRepository.save(route);
                created++;
            }
        }
        return created;
    }
}
