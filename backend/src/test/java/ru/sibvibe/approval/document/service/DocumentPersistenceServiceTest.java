package ru.sibvibe.approval.document.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import ru.sibvibe.approval.document.dto.DocumentCardResponse;
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
import static org.mockito.Mockito.never;
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

    @Test
    void fieldsUpdateReturnsPreviousExtractionBeforeWritingAttemptToken() {
        current.setExtractedFields(new ObjectMapper().valueToTree(new DocumentPersistenceService.StoredFields(
                true,
                List.of(new ru.sibvibe.approval.document.dto.DocumentCardResponse.FieldValue(
                        "date", "2026-09-22", "MODEL", "22.09.2026", 1)),
                null)));

        var update = service.beginFieldsUpdate(1L, 1, 10L, 7L, prepared());

        assertThat(update.previous().modelAvailable()).isTrue();
        assertThat(update.previous().fields()).singleElement().satisfies(field -> {
            assertThat(field.source()).isEqualTo("MODEL");
            assertThat(field.quote()).isEqualTo("22.09.2026");
        });
        assertThat(current.getExtractedFields().path("checkToken").asText())
                .isEqualTo(update.checkAttempt().checkToken());
    }

    // ============ «Проверить заново» (ревью #103, п. 2 и 3) =====
    @Test
    void recheckOfDraftRewritesTheSameVersionWithTheRulesResult() {
        current.setExtractedFields(storedFields("Директору", null));
        var result = new DocumentRuleService.CheckData(true, List.of(field("Директору")), List.of());

        int checked = service.recheck(1L, 1, 10L, 7L, 5L, previous -> {
            assertThat(previous.fields()).extracting(DocumentCardResponse.FieldValue::value).containsExactly("Директору");
            return result;
        });

        assertThat(checked).isEqualTo(1);
        assertThat(current.getCheckStatus()).isEqualTo("CHECKED");
        assertThat(current.getExtractedFields().path("fields").get(0).path("value").asText()).isEqualTo("Директору");
        assertThat(current.getExtractedFields().path("checkToken").isNull()).isTrue();
        verify(versions, never()).save(any());
    }

    @Test
    void recheckOfReturnedChecksANewDraftVersionAndLeavesTheReturnedOneInHistory() {
        document.setStatus(Document.Status.RETURNED);
        current.setExtractedFields(storedFields("Директору", null));
        current.setValidationIssues(new ObjectMapper().createArrayNode());
        current.setCheckStatus("CHECKED");
        JsonNode before = current.getExtractedFields().deepCopy();

        int checked = service.recheck(1L, 1, 10L, 7L, 5L,
                previous -> new DocumentRuleService.CheckData(true, previous.fields(), List.of()));

        assertThat(checked).isEqualTo(2);
        assertThat(document.getStatus()).isEqualTo(Document.Status.DRAFT);
        assertThat(document.getCurrentVersionNo()).isEqualTo(2);
        assertThat(current.getExtractedFields()).as("возвращённая версия не меняется").isEqualTo(before);
        ArgumentCaptor<DocumentVersion> captor = ArgumentCaptor.forClass(DocumentVersion.class);
        verify(versions).save(captor.capture());
        assertThat(captor.getValue().getVersionNo()).isEqualTo(2);
        assertThat(captor.getValue().getCheckStatus()).isEqualTo("CHECKED");
        assertThat(captor.getValue().getExtractedFields().path("fields").get(0).path("value").asText()).isEqualTo("Директору");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<DocumentFile>> copies = ArgumentCaptor.forClass(List.class);
        verify(files).saveAll(copies.capture());
        assertThat(copies.getValue()).singleElement().extracting(DocumentFile::getStorageKey).isEqualTo("old-key");
    }

    @Test
    void failedRulesLeaveTheStoredFieldsAsTheyWere() {
        current.setExtractedFields(storedFields("Директору", null));
        current.setCheckStatus("CHECKED");
        JsonNode before = current.getExtractedFields().deepCopy();

        assertThatThrownBy(() -> service.recheck(1L, 1, 10L, 7L, 5L, previous -> {
            throw new IllegalStateException("правила упали");
        })).isInstanceOf(IllegalStateException.class);

        // До результата правил ничего не записано: транзакция откатится, а поля и так не тронуты.
        assertThat(current.getExtractedFields()).isEqualTo(before);
        assertThat(current.getCheckStatus()).isEqualTo("CHECKED");
    }

    @Test
    void recheckWaitsForARunningCheckAndRefusesOtherStatusesAndOtherPeople() {
        current.setExtractedFields(storedFields("Директору", "идёт-проверка"));
        assertThatThrownBy(() -> service.recheck(1L, 1, 10L, 7L, 5L, previous -> previous))
                .isInstanceOf(DocumentApiException.class)
                .hasMessageContaining("Проверка ещё идёт");

        current.setExtractedFields(storedFields("Директору", null));
        document.setStatus(Document.Status.IN_APPROVAL);
        assertThatThrownBy(() -> service.recheck(1L, 1, 10L, 7L, 5L, previous -> previous))
                .isInstanceOf(DocumentApiException.class);
        document.setStatus(Document.Status.DRAFT);
        assertThatThrownBy(() -> service.recheck(1L, 1, 10L, 8L, 5L, previous -> previous))
                .as("не автор").isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> service.recheck(1L, 1, 11L, 7L, 5L, previous -> previous))
                .as("чужая компания").isInstanceOf(RuntimeException.class);
    }

    private static JsonNode storedFields(String addressee, String checkToken) {
        ObjectNode stored = new ObjectMapper().createObjectNode();
        stored.put("modelAvailable", true);
        stored.putArray("fields").addObject()
                .put("name", "addressee").put("value", addressee).put("source", "MODEL");
        if (checkToken != null) {
            stored.put("checkToken", checkToken);
        } else {
            stored.putNull("checkToken");
        }
        return stored;
    }

    private static DocumentCardResponse.FieldValue field(String value) {
        return new DocumentCardResponse.FieldValue("addressee", value, "MODEL", null, null);
    }

    /** #59: у документа-формы версия хранит содержимое формы, а файлов нет вовсе. */
    @Test
    void formDocumentStoresContentWithoutFiles() {
        when(documents.save(any())).thenAnswer(invocation -> {
            Document saved = invocation.getArgument(0);
            saved.setId(1L);
            return saved;
        });

        service.createForm(10L, 7L, "О закупке", Document.Visibility.PRIVATE, false,
                prepared(Map.of("subject", "О закупке")));

        ArgumentCaptor<DocumentVersion> captor = ArgumentCaptor.forClass(DocumentVersion.class);
        verify(versions).save(captor.capture());
        assertThat(captor.getValue().getContent().path("subject").asText()).isEqualTo("О закупке");
        verify(files, never()).save(any());
    }

    /** #59: правка формы после возврата — новая версия с новым содержимым, прежняя не меняется. */
    @Test
    void formVersionReplacesContentAndReturnedFormBecomesDraft() {
        document.setStatus(Document.Status.RETURNED);
        current.setContent(new ObjectMapper().createObjectNode().put("subject", "О закупке"));

        var created = service.createFormVersion(1L, 10L, 7L, 1, false, prepared(Map.of("subject", "О закупке ноутбуков")));

        ArgumentCaptor<DocumentVersion> captor = ArgumentCaptor.forClass(DocumentVersion.class);
        verify(versions).save(captor.capture());
        assertThat(created.versionNo()).isEqualTo(2);
        assertThat(captor.getValue().getContent().path("subject").asText()).isEqualTo("О закупке ноутбуков");
        assertThat(current.getContent().path("subject").asText()).isEqualTo("О закупке");
        assertThat(document.getStatus()).isEqualTo(Document.Status.DRAFT);
        verify(files, never()).saveAll(any());
    }

    /** Ревью #59: новая версия формы через multipart без файла не теряет содержимое. */
    @Test
    void multipartVersionOfFormKeepsContent() {
        when(files.findByVersionIdOrderByPosition(101L)).thenReturn(List.of());
        current.setContent(new ObjectMapper().createObjectNode().put("subject", "О закупке").put("body", "Текст"));

        service.createVersion(1L, 10L, 7L, 1, false, List.of(), prepared(Map.of("subject", "О закупке ноутбуков")), null);

        ArgumentCaptor<DocumentVersion> captor = ArgumentCaptor.forClass(DocumentVersion.class);
        verify(versions).save(captor.capture());
        assertThat(captor.getValue().getContent().path("subject").asText()).isEqualTo("О закупке ноутбуков");
        assertThat(captor.getValue().getContent().path("body").asText()).isEqualTo("Текст");
    }

    @Test
    void formVersionIsRejectedForDocumentWithFile() {
        assertThatThrownBy(() -> service.createFormVersion(1L, 10L, 7L, 1, false, prepared(Map.of("subject", "О"))))
                .isInstanceOf(DocumentApiException.class)
                .hasMessageContaining("загружен файлом");
    }

    /** #59: у формы поля и есть содержимое — правка поля меняет саму форму. */
    @Test
    void fieldsUpdateOfFormChangesItsContent() {
        current.setContent(new ObjectMapper().createObjectNode().put("subject", "О закупке").put("body", "Текст"));

        service.beginFieldsUpdate(1L, 1, 10L, 7L, prepared(Map.of("subject", "О закупке ноутбуков")));

        assertThat(current.getContent().path("subject").asText()).isEqualTo("О закупке ноутбуков");
        assertThat(current.getContent().path("body").asText()).isEqualTo("Текст");
    }

    @Test
    void formTypeCannotBeChanged() {
        current.setContent(new ObjectMapper().createObjectNode().put("subject", "О закупке"));

        assertThatThrownBy(() -> service.beginRetype(1L, 1, 10L, 7L, prepared()))
                .isInstanceOf(DocumentApiException.class)
                .hasMessageContaining("тип не меняется");
        assertThat(document.getDocumentTypeId()).isEqualTo(5L);
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
        return prepared(Map.of());
    }

    private DocumentRuleService.PreparedCheck prepared(Map<String, String> fields) {
        DocumentType type = new DocumentType();
        type.setId(5L);
        type.setCode("MEMO");
        type.setName("Записка");
        type.setGeneric(false);
        return new DocumentRuleService.PreparedCheck(type, List.of(), fields, List.of());
    }
}
