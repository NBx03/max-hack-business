package ru.sibvibe.approval.document.dto;

import ru.sibvibe.approval.common.dto.UserRef;
import ru.sibvibe.approval.document.entity.Document;

import java.time.Instant;
import java.util.List;

public record DocumentListResponse(
        List<Item> items,
        int page,
        int size,
        long total
) {
    public record Item(
            long id,
            String title,
            TypeRef type,
            Document.Status status,
            UserRef author,
            int currentVersionNo,
            Integer currentStage,
            Instant updatedAt,
            Instant waitingSince
    ) {}

    public record TypeRef(long id, String name) {}
}
