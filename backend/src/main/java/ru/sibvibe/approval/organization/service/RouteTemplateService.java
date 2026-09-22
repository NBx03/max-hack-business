package ru.sibvibe.approval.organization.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.organization.DocumentTypeDirectory;
import ru.sibvibe.approval.organization.entity.Organization;
import ru.sibvibe.approval.organization.entity.Role;
import ru.sibvibe.approval.organization.repository.ApprovalRouteRepository;
import ru.sibvibe.approval.organization.repository.OrganizationRepository;
import ru.sibvibe.approval.organization.repository.RoleRepository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

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
     * Шаблон маршрута компании для типа документа: строки по возрастанию этапа. Одинаковый {@code stageOrder}
     * — параллельные участники. Если у компании для типа ещё нет ни одной строки (типы появились после
     * компании, а добор при старте не успел), маршрут по умолчанию создаётся здесь же и читается заново.
     * Пустой результат значит, что для типа маршрута по умолчанию не существует.
     */
    @Transactional
    public List<TemplateRow> templateFor(long orgId, long documentTypeId) {
        List<TemplateRow> rows = readTemplate(orgId, documentTypeId);
        if (rows.isEmpty()) {
            ensureDefaultRoutes(orgId);
            rows = readTemplate(orgId, documentTypeId);
        }
        return rows;
    }

    private List<TemplateRow> readTemplate(long orgId, long documentTypeId) {
        return routeRepository.findByOrgIdAndDocumentTypeIdOrderByStageOrderAscIdAsc(orgId, documentTypeId).stream()
                .map(route -> new TemplateRow(route.getStageOrder(), route.getRoleId(), route.isMandatory()))
                .toList();
    }

    /** Строка шаблона: роль на этапе; {@code mandatory = false} — пропускается, если носителей роли нет. */
    public record TemplateRow(int stageOrder, long roleId, boolean mandatory) {
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

    /**
     * Маршруты создаются вставкой {@code ON CONFLICT DO NOTHING}, а не проверкой «есть ли уже»: два параллельных
     * первых обращения (предпросмотр или отправка двух документов одного типа) оба не увидят чужих ещё не
     * зафиксированных строк, и без атомарной вставки проигравший получил бы нарушение уникальности, то есть 500.
     * Типы и строки идут в одном и том же порядке во всех транзакциях — так они ждут друг друга, а не блокируются
     * взаимно.
     */
    int createDefaultRoutes(long orgId, Map<String, Long> roleIdsByCode) {
        Map<String, Long> typeIds = typeDirectory.idsByCode(DefaultRouteTemplates.typeCodes());
        int created = 0;
        for (Map.Entry<String, List<DefaultRouteTemplates.Row>> template
                : new TreeMap<>(DefaultRouteTemplates.TEMPLATES).entrySet()) {
            Long typeId = typeIds.get(template.getKey());
            if (typeId == null || routeRepository.existsByOrgIdAndDocumentTypeId(orgId, typeId)) {
                continue;
            }
            for (DefaultRouteTemplates.Row row : template.getValue()) {
                Long roleId = roleIdsByCode.get(row.roleCode());
                if (roleId == null) {
                    continue;
                }
                created += routeRepository.insertIfAbsent(orgId, typeId, row.stageOrder(), roleId, row.mandatory());
            }
        }
        return created;
    }

    /** Маршрут демо-записки из Issue #11: юрист и бухгалтер параллельно, затем директор. */
    void createDemoMemoRoute(long orgId, Map<String, Long> roleIdsByCode) {
        Long typeId = typeDirectory.idsByCode(Set.of(DefaultRouteTemplates.OFFICIAL_MEMO))
                .get(DefaultRouteTemplates.OFFICIAL_MEMO);
        if (typeId == null) {
            throw new IllegalStateException("Не найден тип документа " + DefaultRouteTemplates.OFFICIAL_MEMO);
        }
        routeRepository.insertIfAbsent(orgId, typeId, 1, requiredRole(roleIdsByCode, DefaultRoles.LAWYER), true);
        routeRepository.insertIfAbsent(orgId, typeId, 1, requiredRole(roleIdsByCode, DefaultRoles.ACCOUNTANT), true);
        routeRepository.insertIfAbsent(orgId, typeId, 2, requiredRole(roleIdsByCode, DefaultRoles.DIRECTOR), true);
    }

    private long requiredRole(Map<String, Long> roleIdsByCode, String code) {
        Long roleId = roleIdsByCode.get(code);
        if (roleId == null) {
            throw new IllegalStateException("Не найдена демо-роль " + code);
        }
        return roleId;
    }
}
