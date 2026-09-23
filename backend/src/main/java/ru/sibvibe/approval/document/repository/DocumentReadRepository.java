package ru.sibvibe.approval.document.repository;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import ru.sibvibe.approval.document.entity.Document;
import ru.sibvibe.approval.document.service.DocumentListTab;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

/**
 * Проекции чтения документов. ACL входит в SQL до фильтров, count и pagination,
 * поэтому недоступные документы не влияют даже на total.
 */
@Repository
public class DocumentReadRepository {

    private static final String READABLE = """
            d.org_id = :orgId
            and (
                d.author_id = :userId
                or d.visibility = 'ORG'
                or exists (
                    select 1 from approval_step access_step
                    where access_step.document_id = d.id
                      and access_step.approver_id = :userId
                )
            )
            """;
    private static final String ACTIVE_STEP = """
            exists (
                select 1 from approval_step active_step
                where active_step.document_id = d.id
                  and d.status = 'IN_APPROVAL'
                  and active_step.version_no = d.current_version_no
                  and active_step.approver_id = :userId
                  and active_step.stage_order = d.current_stage
                  and active_step.decision = 'PENDING'
                  and active_step.activated_at is not null
            )
            """;

    private final JdbcClient jdbc;

    public DocumentReadRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public boolean canRead(long documentId, long orgId, long userId) {
        Boolean result = jdbc.sql("""
                        select exists (
                            select 1 from document d
                            where d.id = :documentId and %s
                        )
                        """.formatted(READABLE))
                .param("documentId", documentId)
                .param("orgId", orgId)
                .param("userId", userId)
                .query(Boolean.class)
                .single();
        return Boolean.TRUE.equals(result);
    }

    /**
     * Показатели процесса по документам компании. Момент первой отправки берётся из
     * первого созданного шага: отдельного submitted_at в схеме нет, а все шаги версии
     * создаются атомарно при отправке. Повторная версия не начинает измерение заново.
     */
    public MetricsRow metrics(long orgId, Instant from, Instant toExclusive) {
        StringBuilder period = new StringBuilder();
        if (from != null) {
            period.append(" and submitted_at >= :from");
        }
        if (toExclusive != null) {
            period.append(" and submitted_at < :toExclusive");
        }

        String sql = """
                with submitted_documents as (
                    select d.id,
                           d.status,
                           d.updated_at,
                           min(step.created_at) as submitted_at,
                           bool_or(step.decision = 'RETURNED') as was_returned
                    from document d
                    join approval_step step on step.document_id = d.id
                    where d.org_id = :orgId
                    group by d.id, d.status, d.updated_at
                ), period_documents as (
                    select id,
                           status,
                           was_returned,
                           extract(epoch from (updated_at - submitted_at))::double precision / 3600.0
                               as approval_hours
                    from submitted_documents
                    where 1 = 1
                """ + period + """
                )
                select percentile_cont(0.5) within group (order by approval_hours)
                           filter (where status = 'APPROVED') as median_approval_hours,
                       avg(case when was_returned then 1.0 else 0.0 end) as return_rate,
                       count(*) as documents_count
                from period_documents
                """;

        JdbcClient.StatementSpec statement = jdbc.sql(sql).param("orgId", orgId);
        if (from != null) {
            statement = statement.param("from", from.atOffset(ZoneOffset.UTC));
        }
        if (toExclusive != null) {
            statement = statement.param("toExclusive", toExclusive.atOffset(ZoneOffset.UTC));
        }
        return statement.query((rs, rowNum) -> new MetricsRow(
                number(rs.getObject("median_approval_hours")),
                number(rs.getObject("return_rate")),
                rs.getLong("documents_count")))
                .single();
    }

    public PageRows findDocuments(
            DocumentListTab tab,
            long orgId,
            long userId,
            Document.Status status,
            Long typeId,
            Long authorId,
            Instant from,
            Instant toExclusive,
            int page,
            int size
    ) {
        StringBuilder where = new StringBuilder(" where ").append(READABLE);
        switch (tab) {
            case WAITING_ME -> where.append(" and ").append(ACTIVE_STEP);
            case MINE -> where.append(" and d.author_id = :userId");
            case AVAILABLE -> where.append(" and d.author_id <> :userId and not ").append(ACTIVE_STEP);
        }
        if (status != null) {
            where.append(" and d.status = :status");
        }
        if (typeId != null) {
            where.append(" and d.document_type_id = :typeId");
        }
        if (authorId != null) {
            where.append(" and d.author_id = :authorId");
        }
        if (from != null) {
            where.append(" and d.created_at >= :from");
        }
        if (toExclusive != null) {
            where.append(" and d.created_at < :toExclusive");
        }

        JdbcClient.StatementSpec count = bind(jdbc.sql(
                "select count(*) from document d" + where), orgId, userId,
                status, typeId, authorId, from, toExclusive);
        long total = count.query(Long.class).single();

        String sql = """
                select d.id, d.title, d.status, d.current_version_no, d.current_stage, d.updated_at,
                       dt.id as type_id, dt.name as type_name,
                       author.id as author_id, author.full_name as author_name,
                       (
                           select min(waiting.activated_at)
                           from approval_step waiting
                           where waiting.document_id = d.id
                             and waiting.version_no = d.current_version_no
                             and waiting.approver_id = :userId
                             and waiting.stage_order = d.current_stage
                             and waiting.decision = 'PENDING'
                       ) as waiting_since
                from document d
                join document_type dt on dt.id = d.document_type_id
                join app_user author on author.id = d.author_id
                """ + where + " order by d.updated_at desc, d.id desc limit :size offset :offset";
        JdbcClient.StatementSpec query = bind(jdbc.sql(sql), orgId, userId,
                status, typeId, authorId, from, toExclusive)
                .param("size", size)
                .param("offset", (long) page * size);
        List<ListRow> items = query.query((rs, rowNum) -> new ListRow(
                rs.getLong("id"),
                rs.getString("title"),
                rs.getLong("type_id"),
                rs.getString("type_name"),
                Document.Status.valueOf(rs.getString("status")),
                rs.getLong("author_id"),
                rs.getString("author_name"),
                rs.getInt("current_version_no"),
                rs.getObject("current_stage", Integer.class),
                rs.getObject("updated_at", java.time.OffsetDateTime.class).toInstant(),
                Optional.ofNullable(rs.getObject("waiting_since", java.time.OffsetDateTime.class))
                        .map(java.time.OffsetDateTime::toInstant)
                        .orElse(null)
        )).list();
        return new PageRows(items, total);
    }

    public Optional<FileAccess> findFile(long fileId) {
        return jdbc.sql("""
                        select f.id, f.version_id, f.storage_key, f.file_name, f.mime_type, f.file_size,
                               v.document_id, d.org_id
                        from document_file f
                        join document_version v on v.id = f.version_id
                        join document d on d.id = v.document_id
                        where f.id = :fileId
                        """)
                .param("fileId", fileId)
                .query((rs, rowNum) -> new FileAccess(
                        rs.getLong("id"),
                        rs.getLong("version_id"),
                        rs.getLong("document_id"),
                        rs.getLong("org_id"),
                        rs.getString("storage_key"),
                        rs.getString("file_name"),
                        rs.getString("mime_type"),
                        rs.getLong("file_size")))
                .optional();
    }

    public boolean canUserReadFile(long fileId, long userId) {
        Boolean result = jdbc.sql("""
                        select exists (
                            select 1
                            from document_file f
                            join document_version v on v.id = f.version_id
                            join document d on d.id = v.document_id
                            join organization_member member
                              on member.org_id = d.org_id
                             and member.user_id = :userId
                             and member.status = 'ACTIVE'
                            where f.id = :fileId
                              and (
                                  d.author_id = :userId
                                  or d.visibility = 'ORG'
                                  or exists (
                                      select 1 from approval_step access_step
                                      where access_step.document_id = d.id
                                        and access_step.approver_id = :userId
                                  )
                              )
                        )
                        """)
                .param("fileId", fileId)
                .param("userId", userId)
                .query(Boolean.class)
                .single();
        return Boolean.TRUE.equals(result);
    }

    public List<StepRow> findSteps(long documentId) {
        return jdbc.sql("""
                        select step.id, step.version_no, step.stage_order, step.origin, step.decision,
                               step.comment, step.activated_at, step.decided_at, step.auto_reason,
                               role.id as role_id, role.code as role_code, role.name as role_name,
                               approver.id as approver_id, approver.full_name as approver_name
                        from approval_step step
                        join role on role.id = step.role_id
                        join app_user approver on approver.id = step.approver_id
                        where step.document_id = :documentId
                        order by step.version_no, step.stage_order, step.id
                        """)
                .param("documentId", documentId)
                .query((rs, rowNum) -> new StepRow(
                        rs.getLong("id"),
                        rs.getInt("version_no"),
                        rs.getInt("stage_order"),
                        rs.getString("origin"),
                        rs.getString("decision"),
                        rs.getString("comment"),
                        instant(rs, "activated_at"),
                        instant(rs, "decided_at"),
                        rs.getString("auto_reason"),
                        rs.getLong("role_id"),
                        rs.getString("role_code"),
                        rs.getString("role_name"),
                        rs.getLong("approver_id"),
                        rs.getString("approver_name")))
                .list();
    }

    private JdbcClient.StatementSpec bind(
            JdbcClient.StatementSpec statement,
            long orgId,
            long userId,
            Document.Status status,
            Long typeId,
            Long authorId,
            Instant from,
            Instant toExclusive
    ) {
        statement = statement.param("orgId", orgId).param("userId", userId);
        if (status != null) {
            statement = statement.param("status", status.name());
        }
        if (typeId != null) {
            statement = statement.param("typeId", typeId);
        }
        if (authorId != null) {
            statement = statement.param("authorId", authorId);
        }
        if (from != null) {
            statement = statement.param("from", from);
        }
        if (toExclusive != null) {
            statement = statement.param("toExclusive", toExclusive);
        }
        return statement;
    }

    private static Instant instant(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        java.time.OffsetDateTime value = resultSet.getObject(column, java.time.OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static Double number(Object value) {
        return value == null ? null : ((Number) value).doubleValue();
    }

    public record PageRows(List<ListRow> items, long total) {}

    public record MetricsRow(Double medianApprovalHours, Double returnRate, long documentsCount) {}

    public record ListRow(
            long id,
            String title,
            long typeId,
            String typeName,
            Document.Status status,
            long authorId,
            String authorName,
            int currentVersionNo,
            Integer currentStage,
            Instant updatedAt,
            Instant waitingSince
    ) {}

    public record FileAccess(
            long fileId,
            long versionId,
            long documentId,
            long orgId,
            String storageKey,
            String fileName,
            String mimeType,
            long size
    ) {}

    public record StepRow(
            long id,
            int versionNo,
            int stageOrder,
            String origin,
            String decision,
            String comment,
            Instant activatedAt,
            Instant decidedAt,
            String autoReason,
            long roleId,
            String roleCode,
            String roleName,
            long approverId,
            String approverName
    ) {}
}
