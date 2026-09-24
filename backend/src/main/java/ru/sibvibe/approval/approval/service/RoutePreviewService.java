package ru.sibvibe.approval.approval.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.approval.dto.RoutePreviewResponse;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.document.service.DocumentState;
import ru.sibvibe.approval.document.service.DocumentStateService;
import ru.sibvibe.approval.document.service.DocumentStateService.DocumentSnapshot;

import java.util.ArrayList;
import java.util.List;

/** Предпросмотр маршрута перед отправкой: та же логика, что у отправки, но без сохранения. */
@Service
public class RoutePreviewService {

    private final DocumentStateService documents;
    private final RoutePlanner planner;
    private final CarriedApprovals carriedApprovals;

    public RoutePreviewService(DocumentStateService documents, RoutePlanner planner, CarriedApprovals carriedApprovals) {
        this.documents = documents;
        this.planner = planner;
        this.carriedApprovals = carriedApprovals;
    }

    /**
     * Доступен автору черновика. Проблемы ({@code problems}) не бросаются исключением: экран показывает их
     * плашкой и делает кнопку «Отправить» неактивной.
     */
    @Transactional
    public RoutePreviewResponse preview(CurrentUser user, long documentId) {
        DocumentSnapshot document = documents.authorSnapshot(
                documentId, user, "Маршрут перед отправкой показывается только автору");
        if (document.status() != DocumentState.DRAFT) {
            throw ApprovalErrors.invalidState("Предпросмотр доступен только у черновика");
        }
        RouteResolver.ResolvedRoute route = planner.plan(document.orgId(), document.documentTypeId(), document.authorId());

        List<RoutePreviewResponse.Stage> stages = route.stages().stream()
                .map(stage -> new RoutePreviewResponse.Stage(stage.stageOrder(), stage.participants().stream()
                        .map(participant -> new RoutePreviewResponse.Participant(
                                participant.role(), participant.mandatory(), participant.candidates(),
                                participant.selectedUserId(), participant.resolution().name()))
                        .toList()))
                .toList();
        List<RoutePreviewResponse.Problem> problems = new ArrayList<>();
        route.problems().forEach(problem ->
                problems.add(new RoutePreviewResponse.Problem(problem.code(), problem.message())));
        documents.submissionBlocker(documentId, document.currentVersionNo()).ifPresent(reason ->
                problems.add(new RoutePreviewResponse.Problem("BLOCKING_ISSUES", reason.message())));
        RoutePreviewResponse.CarryOver carryOver = carriedApprovals.of(documentId, document.currentVersionNo())
                .map(carried -> new RoutePreviewResponse.CarryOver(carried.fromVersionNo(), carried.approvals().stream()
                        .map(key -> new RoutePreviewResponse.Approval(key.roleId(), key.userId()))
                        .toList()))
                .orElse(null);
        return new RoutePreviewResponse(stages, problems, carryOver);
    }
}
