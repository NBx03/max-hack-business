package ru.sibvibe.approval.document.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.Instant;

/** Данные таблицы document; ссылки на другие модули хранятся как ID. */
@Entity
@Table(name = "document")
@Getter
@Setter
@NoArgsConstructor
public class Document {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "document_type_id", nullable = false)
    private Long documentTypeId;

    @Column(name = "author_id", nullable = false)
    private Long authorId;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "title", nullable = false, columnDefinition = "text")
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private Status status;

    @Column(name = "current_stage")
    private Integer currentStage;

    @Column(name = "current_version_no", nullable = false)
    private Integer currentVersionNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 32)
    private Visibility visibility;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public enum Status { DRAFT, IN_APPROVAL, APPROVED, RETURNED, REJECTED }

    public enum Visibility { PRIVATE, ORG }
}
