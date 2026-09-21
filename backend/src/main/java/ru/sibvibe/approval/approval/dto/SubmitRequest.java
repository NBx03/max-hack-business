package ru.sibvibe.approval.approval.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Отправка на согласование. {@code selections} — выбор человека там, где кандидатов несколько;
 * {@code extraApprovers} — добавленные автором согласующие (маршрут только растёт, убрать нельзя).
 * Оба списка необязательны: если выбирать не из чего, тело можно не передавать.
 */
public record SubmitRequest(
        @Size(max = 50) List<@Valid @NotNull Choice> selections,
        @Size(max = 20) List<@Valid @NotNull Choice> extraApprovers
) {

    public List<Choice> selectionsOrEmpty() {
        return selections == null ? List.of() : selections;
    }

    public List<Choice> extraApproversOrEmpty() {
        return extraApprovers == null ? List.of() : extraApprovers;
    }

    public record Choice(@NotNull Integer stageOrder, @NotNull Long roleId, @NotNull Long userId) {
    }
}
