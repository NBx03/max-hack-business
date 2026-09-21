package ru.sibvibe.approval.approval.service;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import ru.sibvibe.approval.approval.dto.SubmitRequest;
import ru.sibvibe.approval.approval.entity.ApprovalStep;
import ru.sibvibe.approval.approval.event.ApprovalRequestedEvent;
import ru.sibvibe.approval.approval.event.DocumentDecidedEvent;
import ru.sibvibe.approval.approval.repository.ApprovalStepRepository;
import ru.sibvibe.approval.common.api.DomainException;
import ru.sibvibe.approval.common.api.NotFoundException;
import ru.sibvibe.approval.common.dto.RoleRef;
import ru.sibvibe.approval.common.dto.UserRef;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.document.service.DocumentCheckRules;
import ru.sibvibe.approval.document.service.DocumentState;
import ru.sibvibe.approval.document.service.DocumentStateService;
import ru.sibvibe.approval.document.service.DocumentStateService.DocumentSnapshot;
import ru.sibvibe.approval.organization.service.RoleService;
import ru.sibvibe.approval.organization.service.RouteTemplateService.TemplateRow;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Отправка: проверки до записи, состав шагов, активный этап и автосогласование. */
class SubmissionServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-21T12:00:00Z");
    private static final long DOC = 1;
    private static final long ORG = 10;
    private static final long AUTHOR = 100;
    private static final long TYPE = 5;

    private static final UserRef AUTHOR_REF = new UserRef(AUTHOR, "Автор");
    private static final UserRef BOB = new UserRef(2, "Боб");
    private static final UserRef CAROL = new UserRef(3, "Карол");
    private static final RoleRef HEAD = new RoleRef(20, "DEPARTMENT_HEAD", "Руководитель отдела");
    private static final RoleRef LAWYER = new RoleRef(21, "LAWYER", "Юрист");
    private static final RoleRef DIRECTOR = new RoleRef(22, "DIRECTOR", "Директор");
    private static final Map<Long, RoleRef> ROLES = Map.of(20L, HEAD, 21L, LAWYER, 22L, DIRECTOR);

    private final DocumentStateService documents = mock(DocumentStateService.class);
    private final RoutePlanner planner = mock(RoutePlanner.class);
    private final RoleService roles = mock(RoleService.class);
    private final ApprovalStepRepository steps = mock(ApprovalStepRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final SubmissionService service = new SubmissionService(
            documents, planner, roles, steps, events, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void onlyDraftCanBeSubmittedAndNothingIsWrittenOtherwise() {
        givenDocument(DocumentState.IN_APPROVAL);

        assertThatThrownBy(() -> service.submit(author(), DOC, empty()))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.code()).isEqualTo("INVALID_STATE");
                    assertThat(e.httpStatus().value()).isEqualTo(409);
                });
        verify(steps, never()).saveAll(any());
    }

    @Test
    void blockingIssuesStopTheSubmission() {
        givenDocument(DocumentState.DRAFT);
        when(documents.submissionBlocker(DOC, 3)).thenReturn(Optional.of(DocumentCheckRules.Reason.BLOCKER_ISSUES));

        assertThatThrownBy(() -> service.submit(author(), DOC, empty()))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.code()).isEqualTo("BLOCKING_ISSUES"));
        verify(steps, never()).saveAll(any());
    }

    @Test
    void mandatoryRoleWithNoHolderBlocksSubmissionWithTheRoleName() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 22, true)), Map.of());

        assertThatThrownBy(() -> service.submit(author(), DOC, empty()))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.code()).isEqualTo("ROUTE_ROLE_EMPTY");
                    assertThat(e.details()).containsEntry("role", "Директор");
                });
        verify(steps, never()).saveAll(any());
    }

    @Test
    void severalCandidatesRequireAChoice() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 21, true)), Map.of(21L, List.of(BOB, CAROL)));

        assertThatThrownBy(() -> service.submit(author(), DOC, empty()))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.code()).isEqualTo("SELECTION_REQUIRED");
                    assertThat(e.httpStatus().value()).isEqualTo(409);
                });
        verify(steps, never()).saveAll(any());
    }

    @Test
    void choiceMustBeOneOfTheCandidatesAndOnlyWhereAChoiceIsNeeded() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 21, true), row(2, 22, true)),
                Map.of(21L, List.of(BOB, CAROL), 22L, List.of(BOB)));

        // человек не из кандидатов и несуществующая пара «этап + роль» выглядят как «не найдено»
        assertThatThrownBy(() -> service.submit(author(), DOC, choices(choice(1, 21, 999))))
                .isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.submit(author(), DOC, choices(choice(7, 21, 2))))
                .isInstanceOf(NotFoundException.class);
        // там, где кандидат один, выбирать нечего
        assertThatThrownBy(() -> service.submit(author(), DOC, choices(choice(1, 21, 2), choice(2, 22, 2))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.code()).isEqualTo("VALIDATION_FAILED"));
        // один участник — один выбор
        assertThatThrownBy(() -> service.submit(author(), DOC, choices(choice(1, 21, 2), choice(1, 21, 3))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.code()).isEqualTo("VALIDATION_FAILED"));
        verify(steps, never()).saveAll(any());
    }

    @Test
    void sequentialRouteActivatesOnlyTheFirstStageAndNotifiesItsApprovers() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 21, true), row(2, 22, true)),
                Map.of(21L, List.of(BOB, CAROL), 22L, List.of(CAROL)));

        service.submit(author(), DOC, choices(choice(1, 21, 2)));

        List<ApprovalStep> saved = savedSteps();
        assertThat(saved).hasSize(2);
        ApprovalStep first = saved.get(0);
        assertThat(first.getStageOrder()).isEqualTo(1);
        assertThat(first.getApproverId()).isEqualTo(BOB.id());
        assertThat(first.getDecision()).isEqualTo(ApprovalStep.Decision.PENDING);
        assertThat(first.getActivatedAt()).isEqualTo(NOW);
        assertThat(first.getVersionNo()).isEqualTo(3);
        assertThat(first.getOrigin()).isEqualTo(ApprovalStep.Origin.TEMPLATE);
        ApprovalStep second = saved.get(1);
        assertThat(second.getStageOrder()).isEqualTo(2);
        assertThat(second.getActivatedAt()).as("этап ещё не начался").isNull();

        verify(documents).moveToApproval(DOC, 1);
        verify(documents, never()).approve(anyLong());
        ApprovalRequestedEvent event = event(ApprovalRequestedEvent.class);
        assertThat(event.stageOrder()).isEqualTo(1);
        assertThat(event.approverUserIds()).containsExactly(BOB.id());
        assertThat(event.authorUserId()).isEqualTo(AUTHOR);
    }

    @Test
    void firstStageWithoutAnyoneIsSkippedAndTheNextOneBecomesActive() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 20, false), row(2, 22, true)), Map.of(22L, List.of(CAROL)));

        service.submit(author(), DOC, empty());

        assertThat(savedSteps()).singleElement().satisfies(step -> {
            assertThat(step.getStageOrder()).isEqualTo(2);
            assertThat(step.getActivatedAt()).isEqualTo(NOW);
        });
        verify(documents).moveToApproval(DOC, 2);
    }

    @Test
    void authorHoldingTheOnlyMandatoryRoleApprovesItAutomaticallyAndTheDocumentIsApprovedAtOnce() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 20, false), row(2, 22, true)), Map.of(22L, List.of(AUTHOR_REF)));

        service.submit(author(), DOC, empty());

        assertThat(savedSteps()).singleElement().satisfies(step -> {
            assertThat(step.getApproverId()).isEqualTo(AUTHOR);
            assertThat(step.getDecision()).isEqualTo(ApprovalStep.Decision.APPROVED);
            assertThat(step.getAutoReason()).isEqualTo(ApprovalStep.AutoReason.AUTHOR_HOLDS_ROLE);
            assertThat(step.getDecidedAt()).isEqualTo(NOW);
            assertThat(step.getActivatedAt()).isEqualTo(NOW);
        });
        var order = inOrder(documents);
        order.verify(documents).moveToApproval(DOC, null);
        order.verify(documents).approve(DOC);
        DocumentDecidedEvent event = event(DocumentDecidedEvent.class);
        assertThat(event.outcome()).isEqualTo(DocumentDecidedEvent.Outcome.APPROVED);
        assertThat(event.deciderUserId()).isNull();
    }

    @Test
    void authorStepInALaterStageDoesNotDelayTheFirstRealApproval() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 21, true), row(2, 22, true)),
                Map.of(21L, List.of(BOB), 22L, List.of(AUTHOR_REF)));

        service.submit(author(), DOC, empty());

        List<ApprovalStep> saved = savedSteps();
        assertThat(saved).hasSize(2);
        assertThat(saved.get(0).getDecision()).isEqualTo(ApprovalStep.Decision.PENDING);
        assertThat(saved.get(1).getDecision()).isEqualTo(ApprovalStep.Decision.APPROVED);
        verify(documents).moveToApproval(DOC, 1);
        verify(documents, never()).approve(anyLong());
    }

    @Test
    void addedApproverBecomesAnExtraStepInTheirRoleAndTheRouteOnlyGrows() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 21, true), row(2, 22, true)),
                Map.of(21L, List.of(BOB), 22L, List.of(CAROL)));
        when(roles.rolesById(eq(ORG), any())).thenReturn(Map.of(21L, LAWYER));
        when(roles.carriersOf(ORG, 21)).thenReturn(List.of(BOB, CAROL));

        service.submit(author(), DOC, new SubmitRequest(null, List.of(choice(1, 21, 3))));

        List<ApprovalStep> saved = savedSteps();
        assertThat(saved).hasSize(3);
        assertThat(saved).filteredOn(step -> step.getOrigin() == ApprovalStep.Origin.ADDED_BY_AUTHOR)
                .singleElement().satisfies(extra -> {
                    assertThat(extra.getApproverId()).isEqualTo(CAROL.id());
                    assertThat(extra.getRoleId()).isEqualTo(21L);
                    assertThat(extra.getStageOrder()).isEqualTo(1);
                    assertThat(extra.getDecision()).isEqualTo(ApprovalStep.Decision.PENDING);
                    assertThat(extra.getActivatedAt()).isEqualTo(NOW);
                });
        // шаблонные шаги на месте: обязательного участника убрать нельзя
        assertThat(saved).filteredOn(step -> step.getOrigin() == ApprovalStep.Origin.TEMPLATE).hasSize(2);
        assertThat(event(ApprovalRequestedEvent.class).approverUserIds()).containsExactlyInAnyOrder(BOB.id(), CAROL.id());
    }

    @Test
    void invalidExtraApproversAreRejected() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 21, true)), Map.of(21L, List.of(BOB)));
        when(roles.rolesById(eq(ORG), any())).thenReturn(Map.of(21L, LAWYER));
        when(roles.carriersOf(ORG, 21)).thenReturn(List.of(BOB, CAROL, AUTHOR_REF));

        // не автор и не тот, кто не носит роль
        assertThatThrownBy(() -> service.submit(author(), DOC, extras(choice(1, 21, AUTHOR))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.code()).isEqualTo("VALIDATION_FAILED"));
        assertThatThrownBy(() -> service.submit(author(), DOC, extras(choice(1, 21, 999))))
                .isInstanceOf(NotFoundException.class);
        // этап вне шаблона и чужая роль
        assertThatThrownBy(() -> service.submit(author(), DOC, extras(choice(9, 21, 2))))
                .isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.submit(author(), DOC, extras(choice(1, 777, 2))))
                .isInstanceOf(NotFoundException.class);
        // один и тот же дважды
        assertThatThrownBy(() -> service.submit(author(), DOC, extras(choice(1, 21, 3), choice(1, 21, 3))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.code()).isEqualTo("VALIDATION_FAILED"));
        verify(steps, never()).saveAll(any());
    }

    @Test
    void extraApproverThatIsAlreadyInTheRouteIsRejectedInsteadOfDoublingTheStep() {
        givenDocument(DocumentState.DRAFT);
        // 21 — подставляется автоматически (Боб единственный), 22 — несколько кандидатов, автор выбирает Карол
        givenRoute(List.of(row(1, 21, true), row(1, 22, true)),
                Map.of(21L, List.of(BOB), 22L, List.of(BOB, CAROL)));
        when(roles.rolesById(eq(ORG), any())).thenReturn(Map.of(21L, LAWYER, 22L, DIRECTOR));
        when(roles.carriersOf(ORG, 21)).thenReturn(List.of(BOB, CAROL));
        when(roles.carriersOf(ORG, 22)).thenReturn(List.of(BOB, CAROL));

        // тот, кого подставили автоматически
        assertThatThrownBy(() -> service.submit(author(), DOC,
                new SubmitRequest(List.of(choice(1, 22, 3)), List.of(choice(1, 21, 2)))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.code()).isEqualTo("VALIDATION_FAILED"));
        // тот, кого автор выбрал в этой же отправке
        assertThatThrownBy(() -> service.submit(author(), DOC,
                new SubmitRequest(List.of(choice(1, 22, 3)), List.of(choice(1, 22, 3)))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.code()).isEqualTo("VALIDATION_FAILED"));
        verify(steps, never()).saveAll(any());
    }

    @Test
    void sameApproverInAnotherRoleOrAnotherSelectedCandidateIsAValidExtra() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 21, true), row(1, 22, true)),
                Map.of(21L, List.of(BOB), 22L, List.of(BOB, CAROL)));
        when(roles.rolesById(eq(ORG), any())).thenReturn(Map.of(21L, LAWYER, 22L, DIRECTOR));
        when(roles.carriersOf(ORG, 21)).thenReturn(List.of(BOB, CAROL));
        when(roles.carriersOf(ORG, 22)).thenReturn(List.of(BOB, CAROL));

        // Боб стоит в роли 21, но в роли 22 он — другой шаг (один человек с двумя ролями решает дважды), а Боб
        // как не выбранный кандидат роли 22 — обычное добавление
        service.submit(author(), DOC, new SubmitRequest(List.of(choice(1, 22, 3)),
                List.of(choice(1, 21, 3), choice(1, 22, 2))));

        assertThat(savedSteps()).hasSize(4);
    }

    @Test
    void missingBodyMeansNoSelections() {
        givenDocument(DocumentState.DRAFT);
        givenRoute(List.of(row(1, 22, true)), Map.of(22L, List.of(CAROL)));

        service.submit(author(), DOC, new SubmitRequest(null, null));

        verify(documents).moveToApproval(eq(DOC), anyInt());
    }

    // ---------- вспомогательное ----------

    private void givenDocument(DocumentState status) {
        when(documents.lockForAuthor(eq(DOC), any(), any())).thenReturn(new DocumentSnapshot(
                DOC, ORG, AUTHOR, TYPE, status, 3, null));
        when(documents.submissionBlocker(DOC, 3)).thenReturn(Optional.empty());
    }

    private void givenRoute(List<TemplateRow> template, Map<Long, List<UserRef>> carriers) {
        when(planner.plan(ORG, TYPE, AUTHOR))
                .thenReturn(new RouteResolver().resolve(template, ROLES, carriers, AUTHOR));
    }

    @SuppressWarnings("unchecked")
    private List<ApprovalStep> savedSteps() {
        ArgumentCaptor<List<ApprovalStep>> captor = ArgumentCaptor.forClass(List.class);
        verify(steps).saveAll(captor.capture());
        return captor.getValue();
    }

    private <T> T event(Class<T> type) {
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(captor.capture());
        assertThat(captor.getValue()).isInstanceOf(type);
        return type.cast(captor.getValue());
    }

    private static TemplateRow row(int stage, long roleId, boolean mandatory) {
        return new TemplateRow(stage, roleId, mandatory);
    }

    private static SubmitRequest.Choice choice(int stage, long roleId, long userId) {
        return new SubmitRequest.Choice(stage, roleId, userId);
    }

    private static SubmitRequest empty() {
        return new SubmitRequest(List.of(), List.of());
    }

    private static SubmitRequest choices(SubmitRequest.Choice... selections) {
        return new SubmitRequest(List.of(selections), List.of());
    }

    private static SubmitRequest extras(SubmitRequest.Choice... extras) {
        return new SubmitRequest(List.of(), List.of(extras));
    }

    private static CurrentUser author() {
        var identity = new CurrentUser.UserIdentity(AUTHOR, "Автор");
        return new CurrentUser(identity, identity, 50L, ORG, Set.of(), false, null);
    }
}
