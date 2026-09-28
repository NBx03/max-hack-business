package ru.sibvibe.approval.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Новое название компании (решение Булата 28.09): ошиблись при создании или компания переименовалась. */
public record CompanyNameRequest(@NotBlank @Size(max = 255) String name) {
}
