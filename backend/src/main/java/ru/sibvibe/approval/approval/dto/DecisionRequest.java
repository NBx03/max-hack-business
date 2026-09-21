package ru.sibvibe.approval.approval.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Решение согласующего по шагу. Для {@code RETURN} и {@code REJECT} комментарий обязателен. */
public record DecisionRequest(@NotNull Action decision, @Size(max = 2000) String comment) {

    public enum Action { APPROVE, RETURN, REJECT }
}
