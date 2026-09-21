package ru.sibvibe.approval.document.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import ru.sibvibe.approval.document.entity.Document;

import java.util.Map;

public record CreateDocumentRequest(
        @NotNull @Positive Long documentTypeId,
        @NotBlank @Size(max = 255) String title,
        @NotNull Document.Visibility visibility,
        boolean containsSensitive,
        @Size(max = 100) Map<@NotBlank String, @Size(max = 10_000) String> fields
) {
}
