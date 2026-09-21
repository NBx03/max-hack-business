package ru.sibvibe.approval.document.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import ru.sibvibe.approval.document.entity.Document;
import ru.sibvibe.approval.document.entity.DocumentFile;
import ru.sibvibe.approval.document.entity.DocumentType;
import ru.sibvibe.approval.document.entity.DocumentVersion;
import ru.sibvibe.approval.document.repository.DocumentFileRepository;
import ru.sibvibe.approval.document.repository.DocumentRepository;
import ru.sibvibe.approval.document.repository.DocumentVersionRepository;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DocumentPersistenceServiceTest {

    private final DocumentRepository documents = mock(DocumentRepository.class);
    private final DocumentVersionRepository versions = mock(DocumentVersionRepository.class);
    private final DocumentFileRepository files = mock(DocumentFileRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-09-20T05:00:00Z"), ZoneOffset.UTC);
    private final DocumentPersistenceService service =
            new DocumentPersistenceService(documents, versions, files, new ObjectMapper(), clock);

    private Document document;
    private DocumentVersion current;
    private DocumentFile main;

    @BeforeEach
    void setUp() {
        document = document(Document.Status.DRAFT);
        current = new DocumentVersion();
        current.setId(101L);
        current.setDocumentId(1L);
        current.setVersionNo(1);
        main = new DocumentFile();
        main.setId(201L);
        main.setVersionId(101L);
        main.setKind(DocumentFile.Kind.MAIN);
        main.setPosition(0);
        main.setStorageKey("old-key");
        main.setFileName("old.pdf");
        main.setMimeType("application/pdf");
        main.setFileSize(100L);
        when(documents.findByIdForUpdate(1L)).thenReturn(Optional.of(document));
        when(versions.findByDocumentIdAndVersionNo(1L, 1)).thenReturn(Optional.of(current));
        when(files.findByVersionIdOrderByPosition(101L)).thenReturn(List.of(main));
        when(versions.save(any())).thenAnswer(invocation -> {
            DocumentVersion saved = invocation.getArgument(0);
            if (saved.getId() == null) {
                saved.setId(102L);
            }
            return saved;
        });
    }

    @Test
    void createsNewVersionByReusingCurrentMainWithoutChangingOldVersion() {
        var created = service.createVersion(
                1, 10, 7, 1, false, List.of(201L), prepared(), null);

        assertThat(created.versionNo()).isEqualTo(2);
        assertThat(document.getCurrentVersionNo()).isEqualTo(2);
        assertThat(document.getStatus()).isEqualTo(Document.Status.DRAFT);
        assertThat(current.getVersionNo()).isEqualTo(1);
        assertThat(main.getVersionId()).isEqualTo(101);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<DocumentFile>> captor = ArgumentCaptor.forClass(List.class);
        verify(files).saveAll(captor.capture());
        assertThat(captor.getValue()).singleElement().satisfies(copy -> {
            assertThat(copy.getVersionId()).isEqualTo(102);
            assertThat(copy.getStorageKey()).isEqualTo("old-key");
            assertThat(copy.getKind()).isEqualTo(DocumentFile.Kind.MAIN);
        });
    }

    @Test
    void returnedDocumentBecomesDraftWithNextVersion() {
        document.setStatus(Document.Status.RETURNED);
        document.setCurrentStage(2);

        service.createVersion(1, 10, 7, 1, false, List.of(201L), prepared(), null);

        assertThat(document.getStatus()).isEqualTo(Document.Status.DRAFT);
        assertThat(document.getCurrentStage()).isNull();
        assertThat(document.getCurrentVersionNo()).isEqualTo(2);
    }

    @ParameterizedTest
    @EnumSource(value = Document.Status.class, names = {"IN_APPROVAL", "APPROVED", "REJECTED"})
    void rejectsNewVersionInImmutableStates(Document.Status status) {
        document.setStatus(status);

        assertThatThrownBy(() -> service.createVersion(
                1, 10, 7, 1, false, List.of(201L), prepared(), null))
                .isInstanceOf(DocumentApiException.class)
                .hasMessageContaining("нельзя создать");
    }

    @Test
    void rejectsForeignOrNonCurrentKeepFileWithoutRevealingIt() {
        assertThatThrownBy(() -> service.createVersion(
                1, 10, 7, 1, false, List.of(999L), prepared(), null))
                .isInstanceOf(DocumentApiException.class)
                .hasMessage("Некорректный список сохраняемых файлов");
    }

    @Test
    void staleRuleResultCannotOverwriteNewerFieldsUpdate() {
        DocumentVersion version = new DocumentVersion();
        version.setId(101L);
        version.setDocumentId(1L);
        version.setExtractedFields(new ObjectMapper().createObjectNode().put("checkToken", "new-attempt"));
        version.setCheckStatus("FAILED");
        when(versions.findById(101L)).thenReturn(Optional.of(version));

        boolean completed = service.completeCheck(
                1L,
                new DocumentPersistenceService.CheckAttempt(101L, "old-attempt"),
                new DocumentRuleService.CheckData(false, List.of(), List.of()));

        assertThat(completed).isFalse();
        assertThat(version.getCheckStatus()).isEqualTo("FAILED");
        assertThat(version.getExtractedFields().path("checkToken").asText()).isEqualTo("new-attempt");
    }

    private Document document(Document.Status status) {
        Document value = new Document();
        value.setId(1L);
        value.setDocumentTypeId(5L);
        value.setAuthorId(7L);
        value.setOrgId(10L);
        value.setStatus(status);
        value.setCurrentVersionNo(1);
        value.setVisibility(Document.Visibility.PRIVATE);
        value.setCreatedAt(clock.instant());
        value.setUpdatedAt(clock.instant());
        return value;
    }

    private DocumentRuleService.PreparedCheck prepared() {
        DocumentType type = new DocumentType();
        type.setId(5L);
        type.setCode("MEMO");
        type.setName("Записка");
        type.setGeneric(false);
        return new DocumentRuleService.PreparedCheck(type, List.of(), Map.of(), List.of());
    }
}
