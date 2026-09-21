package ru.sibvibe.approval.approval.service;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.approval.dto.SubmitRequest;
import ru.sibvibe.approval.approval.entity.ApprovalStep;
import ru.sibvibe.approval.approval.event.ApprovalRequestedEvent;
import ru.sibvibe.approval.approval.event.DocumentDecidedEvent;
import ru.sibvibe.approval.approval.repository.ApprovalStepRepository;
import ru.sibvibe.approval.common.api.NotFoundException;
import ru.sibvibe.approval.common.dto.RoleRef;
import ru.sibvibe.approval.common.dto.UserRef;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.document.service.DocumentState;
import ru.sibvibe.approval.document.service.DocumentStateService;
import ru.sibvibe.approval.document.service.DocumentStateService.DocumentSnapshot;
import ru.sibvibe.approval.organization.service.RoleService;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.OptionalInt;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Отправка документа на согласование.
 *
 * Всё выполняется одной транзакцией под блокировкой строки документа (ARCHITECTURE.md, «Конкурентность»):
 * повторная отправка или новая версия одновременно с ней дождутся своей очереди и получат 409.
 * Шаги создаются сразу для всех этапов версии; активируется первый этап, где есть кому решать.
 * Если решать некому вообще (все шаги автосогласованы), документ становится «Согласован» тут же.
 */
@Service
public class SubmissionService {

    private final DocumentStateService documents;
    private final RoutePlanner planner;
    private final RoleService roles;
    private final ApprovalStepRepository steps;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public SubmissionService(
            DocumentStateService documents,
            RoutePlanner planner,
            RoleService roles,
            ApprovalStepRepository steps,
            ApplicationEventPublisher events,
            Clock clock
    ) {
        this.documents = documents;
        this.planner = planner;
        this.roles = roles;
        this.steps = steps;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public void submit(CurrentUser user, long documentId, SubmitRequest request) {
        DocumentSnapshot document = documents.lockForAuthor(
                documentId, user, "Отправить документ на согласование может только автор");
        if (document.status() != DocumentState.DRAFT) {
            throw ApprovalErrors.invalidState("Отправить можно только черновик");
        }
        documents.submissionBlocker(documentId, document.currentVersionNo()).ifPresent(reason -> {
            throw ApprovalErrors.blockingIssues(reason.message());
        });

        RouteResolver.ResolvedRoute route = planner.plan(document.orgId(), document.documentTypeId(), document.authorId());
        route.problems().stream()
                .filter(problem -> problem.code().equals("ROUTE_ROLE_EMPTY"))
                .findFirst()
                .ifPresent(problem -> {
                    throw ApprovalErrors.routeRoleEmpty(problem.role().name());
                });

        Map<StageRole, Long> chosen = validateSelections(route, request.selectionsOrEmpty());
        List<Assignment> extras = validateExtras(document, route, chosen, request.extraApproversOrEmpty());

        Instant now = clock.instant();
        List<ApprovalStep> planned = buildSteps(document, route, chosen, extras, now);
        OptionalInt firstStage = planned.stream()
                .filter(step -> step.getDecision() == ApprovalStep.Decision.PENDING)
                .mapToInt(ApprovalStep::getStageOrder)
                .min();
        firstStage.ifPresent(stage -> planned.stream()
                .filter(step -> step.getDecision() == ApprovalStep.Decision.PENDING && step.getStageOrder() == stage)
                .forEach(step -> step.setActivatedAt(now)));
        steps.saveAll(planned);

        if (firstStage.isPresent()) {
            documents.moveToApproval(documentId, firstStage.getAsInt());
            Set<Long> approvers = planned.stream()
                    .filter(step -> step.getDecision() == ApprovalStep.Decision.PENDING
                            && step.getStageOrder() == firstStage.getAsInt())
                    .map(ApprovalStep::getApproverId)
                    .collect(Collectors.toSet());
            events.publishEvent(new ApprovalRequestedEvent(
                    documentId, document.currentVersionNo(), firstStage.getAsInt(), approvers, document.authorId()));
        } else {
            // Решать некому: обязательные роли только у автора, необязательные пропущены. Согласуется сразу.
            documents.moveToApproval(documentId, null);
            documents.approve(documentId);
            events.publishEvent(new DocumentDecidedEvent(documentId, document.currentVersionNo(), document.authorId(),
                    DocumentDecidedEvent.Outcome.APPROVED, null));
        }
    }

    /**
     * Выбор автора допустим только там, где кандидатов несколько, и только из кандидатов. Любая ссылка мимо шаблона
     * — «не найдено» (контракт, «Идентификаторы от клиента»). Там, где выбирать надо, а выбора нет, — 409.
     */
    private Map<StageRole, Long> validateSelections(RouteResolver.ResolvedRoute route, List<SubmitRequest.Choice> selections) {
        Map<StageRole, RouteResolver.Participant> participants = new HashMap<>();
        route.stages().forEach(stage -> stage.participants().forEach(
                participant -> participants.put(new StageRole(stage.stageOrder(), participant.role().id()), participant)));

        Map<StageRole, Long> chosen = new HashMap<>();
        for (SubmitRequest.Choice choice : selections) {
            StageRole key = new StageRole(choice.stageOrder(), choice.roleId());
            RouteResolver.Participant participant = participants.get(key);
            if (participant == null) {
                throw new NotFoundException();
            }
            if (participant.resolution() != RouteResolver.Resolution.SELECT) {
                throw ApprovalErrors.validation("Для роли «" + participant.role().name() + "» выбор не нужен");
            }
            if (participant.candidates().stream().noneMatch(candidate -> candidate.id() == choice.userId())) {
                throw new NotFoundException();
            }
            if (chosen.put(key, choice.userId()) != null) {
                throw ApprovalErrors.validation("Согласующий для роли «" + participant.role().name()
                        + "» указан дважды");
            }
        }
        for (RouteResolver.Stage stage : route.stages()) {
            for (RouteResolver.Participant participant : stage.participants()) {
                if (participant.resolution() == RouteResolver.Resolution.SELECT
                        && !chosen.containsKey(new StageRole(stage.stageOrder(), participant.role().id()))) {
                    throw ApprovalErrors.selectionRequired(stage.stageOrder(), participant.role().name());
                }
            }
        }
        return chosen;
    }

    /**
     * Добавленный согласующий (SHOULD) согласует в роли: он активный носитель этой роли и не автор. Этап должен
     * существовать в шаблоне: маршрут только расширяется внутри своих этапов и никогда не урезается. Тот, кто уже
     * стоит в маршруте той же ролью на том же этапе (подставлен автоматически или выбран автором), «добавленным»
     * быть не может: маршрут от этого не вырос бы, а этап ждал бы одного человека дважды.
     */
    private List<Assignment> validateExtras(
            DocumentSnapshot document,
            RouteResolver.ResolvedRoute route,
            Map<StageRole, Long> chosen,
            List<SubmitRequest.Choice> extras
    ) {
        Set<Integer> stageOrders = route.stages().stream().map(RouteResolver.Stage::stageOrder).collect(Collectors.toSet());
        Set<Long> roleIds = extras.stream().map(SubmitRequest.Choice::roleId).collect(Collectors.toSet());
        Map<Long, RoleRef> knownRoles = roles.rolesById(document.orgId(), roleIds);
        Set<Assignment> taken = templateAssignments(route, chosen);
        List<Assignment> result = new ArrayList<>();
        for (SubmitRequest.Choice extra : extras) {
            if (!stageOrders.contains(extra.stageOrder()) || !knownRoles.containsKey(extra.roleId())) {
                throw new NotFoundException();
            }
            if (extra.userId() == document.authorId()) {
                throw ApprovalErrors.validation("Автор не может быть добавленным согласующим");
            }
            List<UserRef> carriers = roles.carriersOf(document.orgId(), extra.roleId());
            if (carriers.stream().noneMatch(user -> user.id() == extra.userId())) {
                throw new NotFoundException();
            }
            Assignment assignment = new Assignment(extra.stageOrder(), extra.roleId(), extra.userId());
            if (!taken.add(assignment)) {
                throw ApprovalErrors.validation("Этот согласующий уже есть в маршруте на этом этапе");
            }
            result.add(assignment);
        }
        return result;
    }

    /** Кто из шаблона уже назначен: подставленные автоматически и выбранные автором. */
    private static Set<Assignment> templateAssignments(RouteResolver.ResolvedRoute route, Map<StageRole, Long> chosen) {
        Set<Assignment> assigned = new HashSet<>();
        for (RouteResolver.Stage stage : route.stages()) {
            for (RouteResolver.Participant participant : stage.participants()) {
                long roleId = participant.role().id();
                Long userId = switch (participant.resolution()) {
                    case AUTO -> participant.selectedUserId();
                    case SELECT -> chosen.get(new StageRole(stage.stageOrder(), roleId));
                    case SKIPPED, AUTHOR_HOLDS_ROLE -> null;
                };
                if (userId != null) {
                    assigned.add(new Assignment(stage.stageOrder(), roleId, userId));
                }
            }
        }
        return assigned;
    }

    private List<ApprovalStep> buildSteps(
            DocumentSnapshot document,
            RouteResolver.ResolvedRoute route,
            Map<StageRole, Long> chosen,
            List<Assignment> extras,
            Instant now
    ) {
        List<ApprovalStep> planned = new ArrayList<>();
        for (RouteResolver.Stage stage : route.stages()) {
            for (RouteResolver.Participant participant : stage.participants()) {
                long roleId = participant.role().id();
                switch (participant.resolution()) {
                    case SKIPPED -> {
                        // необязательный участник без кандидатов: шага нет, в предпросмотре он показан как «пропускается»
                    }
                    case AUTHOR_HOLDS_ROLE -> {
                        ApprovalStep step = step(document, stage.stageOrder(), roleId, document.authorId(),
                                ApprovalStep.Origin.TEMPLATE, now);
                        step.setDecision(ApprovalStep.Decision.APPROVED);
                        step.setAutoReason(ApprovalStep.AutoReason.AUTHOR_HOLDS_ROLE);
                        step.setActivatedAt(now);
                        step.setDecidedAt(now);
                        planned.add(step);
                    }
                    case AUTO -> planned.add(step(document, stage.stageOrder(), roleId, participant.selectedUserId(),
                            ApprovalStep.Origin.TEMPLATE, now));
                    case SELECT -> planned.add(step(document, stage.stageOrder(), roleId,
                            chosen.get(new StageRole(stage.stageOrder(), roleId)), ApprovalStep.Origin.TEMPLATE, now));
                }
            }
            for (Assignment extra : extras) {
                if (extra.stageOrder() == stage.stageOrder()) {
                    planned.add(step(document, stage.stageOrder(), extra.roleId(), extra.userId(),
                            ApprovalStep.Origin.ADDED_BY_AUTHOR, now));
                }
            }
        }
        return planned;
    }

    private ApprovalStep step(
            DocumentSnapshot document, int stageOrder, long roleId, long approverId,
            ApprovalStep.Origin origin, Instant now
    ) {
        ApprovalStep step = new ApprovalStep();
        step.setDocumentId(document.id());
        step.setVersionNo(document.currentVersionNo());
        step.setApproverId(approverId);
        step.setRoleId(roleId);
        step.setStageOrder(stageOrder);
        step.setOrigin(origin);
        step.setDecision(ApprovalStep.Decision.PENDING);
        step.setCreatedAt(now);
        return step;
    }

    private record StageRole(int stageOrder, long roleId) {
    }

    /** Кто согласует на этапе в какой роли. */
    private record Assignment(int stageOrder, long roleId, long userId) {
    }
}
