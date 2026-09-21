package ru.sibvibe.approval.approval.dto;

import ru.sibvibe.approval.common.dto.RoleRef;
import ru.sibvibe.approval.common.dto.UserRef;

import java.util.List;

/** Предпросмотр маршрута: полностью разрешённая цепочка с именами; ничего не сохраняется. */
public record RoutePreviewResponse(List<Stage> stages, List<Problem> problems) {

    public RoutePreviewResponse {
        stages = List.copyOf(stages);
        problems = List.copyOf(problems);
    }

    public record Stage(int stageOrder, List<Participant> participants) {
        public Stage {
            participants = List.copyOf(participants);
        }
    }

    /** {@code resolution}: SELECT, AUTO, SKIPPED или AUTHOR_HOLDS_ROLE — см. контракт. */
    public record Participant(
            RoleRef role,
            boolean mandatory,
            List<UserRef> candidates,
            Long selectedUserId,
            String resolution
    ) {
        public Participant {
            candidates = List.copyOf(candidates);
        }
    }

    /** {@code code}: ROUTE_ROLE_EMPTY или BLOCKING_ISSUES; пока список не пуст, отправить нельзя. */
    public record Problem(String code, String message) {
    }
}
