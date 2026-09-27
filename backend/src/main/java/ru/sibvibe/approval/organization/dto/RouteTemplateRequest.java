package ru.sibvibe.approval.organization.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * Новый состав шаблона маршрута вида документа (#98): этапы по порядку — позиция в списке становится
 * {@code stage_order}, внутри этапа роли параллельны. Замена полная: сервер удаляет прежние строки шаблона
 * и создаёт эти. Пустой список этапов допустим — тогда маршрут для этого вида полностью составляет автор.
 */
public record RouteTemplateRequest(@NotNull List<@Valid StageInput> stages) {

    public record StageInput(@NotNull List<@Valid RoleInput> participants) {
    }

    public record RoleInput(@NotNull Long roleId, boolean mandatory) {
    }
}
