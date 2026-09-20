package ru.sibvibe.approval.document.dto;

import jakarta.validation.constraints.NotNull;

import java.util.Map;

public record UpdateFieldsRequest(@NotNull Map<String, String> fields) {
}
