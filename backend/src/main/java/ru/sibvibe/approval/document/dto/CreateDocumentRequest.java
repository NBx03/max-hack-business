package ru.sibvibe.approval.document.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import ru.sibvibe.approval.document.entity.Document;

import java.util.Map;

public record CreateDocumentRequest(
        @NotNull @Positive Long documentTypeId,
        @NotBlank String title,
        @NotNull Document.Visibility visibility,
        boolean containsSensitive,
        Map<String, String> fields
) {
}
