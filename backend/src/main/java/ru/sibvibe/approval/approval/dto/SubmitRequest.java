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

    /**
     * {@code newStage} — только у добавленных согласующих (приёмка 24.09, п. 12): {@code true} — отдельный новый
     * этап <b>перед</b> этапом шаблона {@code stageOrder}; {@code stageOrder} на единицу больше последнего этапа —
     * новый последний этап. Несколько добавленных с одним и тем же местом согласуют одновременно.
     * {@code false} или нет — вместе с этапом {@code stageOrder}. Этапы шаблона не убираются и не меняются местами.
     */
    public record Choice(@NotNull Integer stageOrder, @NotNull Long roleId, @NotNull Long userId, Boolean newStage) {

        public Choice(Integer stageOrder, Long roleId, Long userId) {
            this(stageOrder, roleId, userId, null);
        }

        public boolean isNewStage() {
            return Boolean.TRUE.equals(newStage);
        }
    }
}
