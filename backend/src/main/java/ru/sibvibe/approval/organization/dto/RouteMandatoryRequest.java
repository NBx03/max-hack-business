package ru.sibvibe.approval.organization.dto;

import jakarta.validation.constraints.NotNull;

/** Сделать роль в шаблоне вида документа обязательной или нет (#109). */
public record RouteMandatoryRequest(@NotNull Boolean mandatory) {
}
