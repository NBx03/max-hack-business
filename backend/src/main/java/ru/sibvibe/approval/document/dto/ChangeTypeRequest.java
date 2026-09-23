package ru.sibvibe.approval.document.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/** Новый тип черновика — если модель определила вид неверно (#86). */
public record ChangeTypeRequest(@NotNull @Positive Long documentTypeId) {
}
