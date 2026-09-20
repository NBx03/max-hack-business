package ru.sibvibe.approval.document.dto;

import ru.sibvibe.approval.common.dto.RoleRef;
import ru.sibvibe.approval.common.dto.UserRef;
import ru.sibvibe.approval.document.entity.Document;
import ru.sibvibe.approval.document.entity.DocumentFile;
import ru.sibvibe.approval.rules.RuleEngine;

import java.time.Instant;
import java.util.List;

public record DocumentCardResponse(
        long id,
        String title,
        TypeRef type,
        Document.Status status,
        Document.Visibility visibility,
        UserRef author,
        int currentVersionNo,
        List<VersionView> versions,
        CheckResult check,
        RouteView route,
        Permissions permissions,
        List<Long> myActiveStepIds
) {
    public record TypeRef(long id, String name, boolean isGeneric) {}

    public record VersionView(
            int versionNo,
            boolean containsSensitive,
            Instant createdAt,
            UserRef createdBy,
            List<FileRef> files
    ) {}

    public record FileRef(
            long id,
            DocumentFile.Kind kind,
            String fileName,
            String mimeType,
            long size,
            String downloadUrl,
            Instant downloadExpiresAt
    ) {}

    public record CheckResult(
            int versionNo,
            String status,
            boolean modelAvailable,
            List<FieldValue> fields,
            List<ValidationIssueView> issues
    ) {}

    public record FieldValue(
            String name,
            String value,
            String source,
            String quote,
            Integer page
    ) {}

    public record ValidationIssueView(
            long ruleId,
            String fieldName,
            String message,
            RuleEngine.Severity severity,
            RuleEngine.RuleKind kind,
            String sourceTitle,
            String sourceUrl,
            String sourceRef,
            String quote,
            Integer page
    ) {}

    public record RouteView(
            int versionNo,
            List<StageView> stages,
            List<StepView> history
    ) {}

    public record StageView(int stageOrder, String state, List<StepView> steps) {}

    public record StepView(
            long id,
            int versionNo,
            int stageOrder,
            RoleRef role,
            UserRef approver,
            String origin,
            String decision,
            String comment,
            Instant activatedAt,
            Instant decidedAt,
            String autoReason
    ) {}

    public record Permissions(
            boolean canEditFields,
            boolean canUploadVersion,
            boolean canSubmit,
            boolean canAddApprover
    ) {}
}
