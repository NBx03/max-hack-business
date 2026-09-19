package ru.sibvibe.approval.approval.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.Instant;

/** Данные таблицы approval_step; ссылки на другие модули хранятся как ID. */
@Entity
@Table(name = "approval_step")
@Getter
@Setter
@NoArgsConstructor
public class ApprovalStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "document_id", nullable = false)
    private Long documentId;

    @Column(name = "version_no", nullable = false)
    private Integer versionNo;

    @Column(name = "approver_id", nullable = false)
    private Long approverId;

    @Column(name = "role_id", nullable = false)
    private Long roleId;

    @Column(name = "stage_order", nullable = false)
    private Integer stageOrder;

    @Enumerated(EnumType.STRING)
    @Column(name = "origin", nullable = false, length = 32)
    private Origin origin;

    @Enumerated(EnumType.STRING)
    @Column(name = "decision", nullable = false, length = 32)
    private Decision decision;

    @Enumerated(EnumType.STRING)
    @Column(name = "auto_reason", length = 32)
    private AutoReason autoReason;

    @Column(name = "comment", columnDefinition = "text")
    private String comment;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    public enum Origin { TEMPLATE, ADDED_BY_AUTHOR }

    public enum Decision { PENDING, APPROVED, RETURNED, REJECTED, SKIPPED }

    public enum AutoReason { AUTHOR_HOLDS_ROLE }
}
