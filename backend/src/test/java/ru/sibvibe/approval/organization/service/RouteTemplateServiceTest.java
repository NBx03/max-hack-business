package ru.sibvibe.approval.organization.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import ru.sibvibe.approval.organization.DocumentTypeDirectory;
import ru.sibvibe.approval.organization.entity.Organization;
import ru.sibvibe.approval.organization.entity.Role;
import ru.sibvibe.approval.organization.repository.ApprovalRouteRepository;
import ru.sibvibe.approval.organization.repository.OrganizationRepository;
import ru.sibvibe.approval.organization.repository.RoleRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RouteTemplateServiceTest {

    private static final long ORG = 7;

    private final ApprovalRouteRepository routeRepository = mock(ApprovalRouteRepository.class);
    private final RoleRepository roleRepository = mock(RoleRepository.class);
    private final OrganizationRepository organizationRepository = mock(OrganizationRepository.class);
    private final DocumentTypeDirectory directory = mock(DocumentTypeDirectory.class);
    private final RouteTemplateService service = new RouteTemplateService(
            routeRepository, roleRepository, organizationRepository, directory);
    /** Строки, которые сервис пытался вставить, в порядке вставки. */
    private final List<InsertedRoute> inserted = new ArrayList<>();

    @BeforeEach
    void recordInserts() {
        when(routeRepository.insertIfAbsent(anyLong(), anyLong(), anyInt(), anyLong(), anyBoolean())).thenAnswer(call -> {
            inserted.add(new InsertedRoute(call.getArgument(0), call.getArgument(1), call.getArgument(2),
                    call.getArgument(3), call.getArgument(4)));
            return 1;
        });
    }

    @Test
    void createsConservativeRoutesOnlyForTypesThatExist() {
        when(directory.idsByCode(anyCollection())).thenReturn(Map.of(
                DefaultRouteTemplates.OFFICIAL_MEMO, 100L,
                DefaultRouteTemplates.GENERIC, 400L));

        int created = service.createDefaultRoutes(ORG, roleIds());

        assertThat(created).isEqualTo(3);
        List<InsertedRoute> routes = savedRoutes(3);
        // служебная записка: руководитель отдела (необязательно) -> директор
        assertRoute(routes, 100, 1, DefaultRoles.DEPARTMENT_HEAD, false);
        assertRoute(routes, 100, 2, DefaultRoles.DIRECTOR, true);
        // любой файл: директор
        assertRoute(routes, 400, 1, DefaultRoles.DIRECTOR, true);
        assertThat(routes).allSatisfy(route -> assertThat(route.orgId()).isEqualTo(ORG));
    }

    @Test
    void supportMeasureRequestHasParallelOptionalLawyerAndAccountantBeforeDirector() {
        when(directory.idsByCode(anyCollection())).thenReturn(Map.of(DefaultRouteTemplates.SUPPORT_MEASURE_REQUEST, 300L));

        service.createDefaultRoutes(ORG, roleIds());

        List<InsertedRoute> routes = savedRoutes(3);
        assertRoute(routes, 300, 1, DefaultRoles.LAWYER, false);
        assertRoute(routes, 300, 1, DefaultRoles.ACCOUNTANT, false);
        assertRoute(routes, 300, 2, DefaultRoles.DIRECTOR, true);
    }

    @Test
    void businessTripRequestHasThreeSequentialStagesWithOptionalHeadAndAccountantBeforeDirector() {
        when(directory.idsByCode(anyCollection())).thenReturn(Map.of(DefaultRouteTemplates.BUSINESS_TRIP_REQUEST, 500L));

        service.createDefaultRoutes(ORG, roleIds());

        List<InsertedRoute> routes = savedRoutes(3);
        assertRoute(routes, 500, 1, DefaultRoles.DEPARTMENT_HEAD, false);
        assertRoute(routes, 500, 2, DefaultRoles.ACCOUNTANT, false);
        assertRoute(routes, 500, 3, DefaultRoles.DIRECTOR, true);
    }

    @Test
    void everyTemplateEndsWithMandatoryDirector() {
        DefaultRouteTemplates.TEMPLATES.forEach((type, rows) -> {
            int lastStage = rows.stream().mapToInt(DefaultRouteTemplates.Row::stageOrder).max().orElseThrow();
            assertThat(rows).as(type).anySatisfy(row -> {
                assertThat(row.stageOrder()).isEqualTo(lastStage);
                assertThat(row.roleCode()).isEqualTo(DefaultRoles.DIRECTOR);
                assertThat(row.mandatory()).isTrue();
            });
        });
    }

    @Test
    void doesNotDuplicateRoutesWhenCalledAgain() {
        when(directory.idsByCode(anyCollection())).thenReturn(Map.of(DefaultRouteTemplates.GENERIC, 400L));
        when(routeRepository.existsByOrgIdAndDocumentTypeId(ORG, 400L)).thenReturn(true);

        assertThat(service.createDefaultRoutes(ORG, roleIds())).isZero();
        assertThat(inserted).isEmpty();
    }

    @Test
    void routeAlreadyCreatedByAParallelTransactionIsNotAnError() {
        // проигравшая гонку вставка получает 0 строк вместо нарушения уникальности: ничего не создано, но и не упало
        when(directory.idsByCode(anyCollection())).thenReturn(Map.of(DefaultRouteTemplates.GENERIC, 400L));
        when(routeRepository.insertIfAbsent(anyLong(), anyLong(), anyInt(), anyLong(), anyBoolean())).thenReturn(0);

        assertThat(service.createDefaultRoutes(ORG, roleIds())).isZero();
    }

    @Test
    void typesAreInsertedInAFixedOrderSoParallelTransactionsWaitForEachOtherInsteadOfDeadlocking() {
        when(directory.idsByCode(anyCollection())).thenReturn(Map.of(
                DefaultRouteTemplates.OFFICIAL_MEMO, 100L, DefaultRouteTemplates.VACATION_REQUEST, 200L,
                DefaultRouteTemplates.SUPPORT_MEASURE_REQUEST, 300L, DefaultRouteTemplates.GENERIC, 400L));

        service.createDefaultRoutes(ORG, roleIds());

        // GENERIC < OFFICIAL_MEMO < SUPPORT_MEASURE_REQUEST < VACATION_REQUEST
        assertThat(inserted).extracting(InsertedRoute::typeId)
                .containsExactly(400L, 100L, 100L, 300L, 300L, 300L, 200L, 200L);
    }

    @Test
    void ensureDefaultRoutesUsesRolesOfThatCompany() {
        Role director = new Role();
        director.setId(11L);
        director.setOrgId(ORG);
        director.setCode(DefaultRoles.DIRECTOR);
        director.setName("Директор");
        when(roleRepository.findByOrgIdOrderById(ORG)).thenReturn(List.of(director));
        when(directory.idsByCode(anyCollection())).thenReturn(Map.of(
                DefaultRouteTemplates.OFFICIAL_MEMO, 100L));

        int created = service.ensureDefaultRoutes(ORG);

        // роли «Руководитель отдела» в компании нет, поэтому создан только этап директора
        assertThat(created).isEqualTo(1);
        assertThat(inserted).hasSize(1);
    }

    @Test
    void backfillCoversEveryRealCompanyAndIsIdempotent() {
        Organization first = org(7);
        Organization second = org(8);
        when(organizationRepository.findByDemoFalseOrderById()).thenReturn(List.of(first, second));
        when(roleRepository.findByOrgIdOrderById(7L)).thenReturn(List.of(role(7, 11, DefaultRoles.DIRECTOR)));
        when(roleRepository.findByOrgIdOrderById(8L)).thenReturn(List.of(role(8, 21, DefaultRoles.DIRECTOR)));
        when(directory.idsByCode(anyCollection())).thenReturn(Map.of(DefaultRouteTemplates.GENERIC, 400L));

        // у компании 8 маршрут для этого типа уже есть, у компании 7 — ещё нет
        when(routeRepository.existsByOrgIdAndDocumentTypeId(8L, 400L)).thenReturn(true);

        assertThat(service.backfillAllOrganizations()).isEqualTo(1);
        List<InsertedRoute> saved = savedRoutes(1);
        assertThat(saved.getFirst().orgId()).isEqualTo(7L);
        assertThat(saved.getFirst().roleId()).isEqualTo(11L);
    }

    @Test
    void backfillWithoutDocumentTypesCreatesNothing() {
        when(organizationRepository.findByDemoFalseOrderById()).thenReturn(List.of(org(7)));
        when(roleRepository.findByOrgIdOrderById(7L)).thenReturn(List.of(role(7, 11, DefaultRoles.DIRECTOR)));
        when(directory.idsByCode(anyCollection())).thenReturn(Map.of());

        assertThat(service.backfillAllOrganizations()).isZero();
        assertThat(inserted).isEmpty();
    }

    private Organization org(long id) {
        Organization org = new Organization();
        org.setId(id);
        org.setName("Компания " + id);
        return org;
    }

    private Role role(long orgId, long id, String code) {
        Role role = new Role();
        role.setId(id);
        role.setOrgId(orgId);
        role.setCode(code);
        role.setName(code);
        return role;
    }

    private Map<String, Long> roleIds() {
        Map<String, Long> ids = new HashMap<>();
        long next = 1;
        for (DefaultRoles.Seed seed : DefaultRoles.ALL) {
            ids.put(seed.code(), next++);
        }
        return ids;
    }

    private List<InsertedRoute> savedRoutes(int expected) {
        assertThat(inserted).hasSize(expected);
        return inserted;
    }

    private void assertRoute(List<InsertedRoute> routes, long typeId, int stage, String roleCode, boolean mandatory) {
        long roleId = roleIds().get(roleCode);
        assertThat(routes).anySatisfy(route -> {
            assertThat(route.typeId()).isEqualTo(typeId);
            assertThat(route.stageOrder()).isEqualTo(stage);
            assertThat(route.roleId()).isEqualTo(roleId);
            assertThat(route.mandatory()).isEqualTo(mandatory);
        });
    }

    private record InsertedRoute(long orgId, long typeId, int stageOrder, long roleId, boolean mandatory) {
    }
}
