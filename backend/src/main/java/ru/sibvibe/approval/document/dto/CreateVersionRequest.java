package ru.sibvibe.approval.document.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;
import java.util.Map;

public record CreateVersionRequest(
        Map<String, String> fields,
        boolean containsSensitive,
        @NotNull List<@Positive Long> keepFileIds
) {
}
