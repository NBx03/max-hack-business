package ru.sibvibe.approval.document.service;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import ru.sibvibe.approval.common.api.DomainException;
import ru.sibvibe.approval.common.api.NotFoundException;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.document.dto.CreateDocumentRequest;
import ru.sibvibe.approval.document.dto.CreateVersionRequest;
import ru.sibvibe.approval.document.dto.DocumentCardResponse;
import ru.sibvibe.approval.document.entity.Document;
import ru.sibvibe.approval.document.entity.DocumentType;
import ru.sibvibe.approval.document.repository.DocumentReadRepository;
import ru.sibvibe.approval.document.repository.DocumentRepository;
import ru.sibvibe.approval.storage.FileStorage;
import ru.sibvibe.approval.storage.FileStorageException;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DocumentCommandServiceTest {

    private final DocumentRepository documents = mock(DocumentRepository.class);
    private final DocumentReadRepository documentReads = mock(DocumentReadRepository.class);
    private final DocumentFileValidator fileValidator = mock(DocumentFileValidator.class);
    private final DocumentRuleService rules = mock(DocumentRuleService.class);
    private final DocumentAnalysisService analysis = mock(DocumentAnalysisService.class);
    private final DocumentPersistenceService persistence = mock(DocumentPersistenceService.class);
    private final DocumentViewService views = mock(DocumentViewService.class);
    private final FileStorage storage = mock(FileStorage.class);
    private final DocumentTypeGuessService typeGuess = mock(DocumentTypeGuessService.class);
    private final DocumentCommandService service =
            new DocumentCommandService(
                    documents, documentReads, fileValidator, rules, analysis, persistence, views, storage, typeGuess, new DocxCorrector());

    @Test
    void deletesNewObjectWhenMetadataTransactionFails() {
        MockMultipartFile multipart = new MockMultipartFile("main", "memo.pdf", "application/pdf", new byte[]{1});
        var validated = new DocumentFileValidator.ValidatedFile(new byte[]{1}, "memo.pdf", "application/pdf");
        var prepared = prepared();
        when(fileValidator.validateMain(multipart)).thenReturn(validated);
        when(rules.prepare(anyLong(), eq(5L), eq(Map.of()))).thenReturn(prepared);
        when(storage.put(any(), any(), any(), anyLong())).thenReturn("new-key");
        when(persistence.create(anyLong(), anyLong(), any(), any(), anyBoolean(), anyBoolean(), any(), any()))
                .thenThrow(new IllegalStateException("db unavailable"));

        assertThatThrownBy(() -> service.create(user(), request(), multipart))
                .isInstanceOf(IllegalStateException.class);

        verify(storage).delete("new-key");
        verify(views, never()).card(anyLong(), any());
    }

    @Test
    void storageFailureDoesNotCreateDatabaseMetadata() {
        MockMultipartFile multipart = new MockMultipartFile(
                "main", "memo.pdf", "application/pdf", new byte[]{1});
        var validated = new DocumentFileValidator.ValidatedFile(
                new byte[]{1}, "memo.pdf", "application/pdf");
        when(fileValidator.validateMain(multipart)).thenReturn(validated);
        when(rules.prepare(anyLong(), eq(5L), eq(Map.of()))).thenReturn(prepared());
        when(storage.put(any(), any(), any(), anyLong()))
                .thenThrow(new FileStorageException("storage unavailable"));

        assertThatThrownBy(() -> service.create(user(), request(), multipart))
                .isInstanceOf(FileStorageException.class);

        verify(persistence, never()).create(anyLong(), anyLong(), any(), any(), anyBoolean(), anyBoolean(), any(), any());
    }

    @Test
    void ruleFailureLeavesPersistedVersionMarkedFailedAndReturnsCard() {
        MockMultipartFile multipart = new MockMultipartFile("main", "memo.pdf", "application/pdf", new byte[]{1});
        var validated = new DocumentFileValidator.ValidatedFile(new byte[]{1}, "memo.pdf", "application/pdf");
        var prepared = prepared();
        var pending = new DocumentRuleService.CheckData(false, List.of(), List.of());
        when(fileValidator.validateMain(multipart)).thenReturn(validated);
        when(rules.prepare(anyLong(), eq(5L), eq(Map.of()))).thenReturn(prepared);
        when(rules.pending(prepared)).thenReturn(pending);
        when(analysis.analyze(2, false, prepared)).thenThrow(new IllegalArgumentException("broken rule"));
        when(storage.put(any(), any(), any(), anyLong())).thenReturn("new-key");
        when(persistence.create(anyLong(), anyLong(), any(), any(), anyBoolean(), anyBoolean(), any(), any()))
                .thenReturn(new DocumentPersistenceService.CreatedVersion(1, 2, 1, "attempt-1"));
        when(views.card(1, user())).thenReturn(mock(DocumentCardResponse.class));

        service.create(user(), request(), multipart);

        verify(persistence).failCheck(
                1, new DocumentPersistenceService.CheckAttempt(2, "attempt-1"), pending);
        verify(storage, never()).delete("new-key");
    }

    @Test
    void autoTypeAndTitleComeFromModelAndAreMarkedAutoDetected() {
        MockMultipartFile multipart = new MockMultipartFile("main", "scan_17.pdf", "application/pdf", new byte[]{1});
        var validated = new DocumentFileValidator.ValidatedFile(new byte[]{1}, "scan_17.pdf", "application/pdf");
        var prepared = prepared();
        when(fileValidator.validateMain(multipart)).thenReturn(validated);
        when(typeGuess.guess(validated.content(), "application/pdf"))
                .thenReturn(new DocumentTypeGuessService.Guess(prepared.type(), "О закупке ноутбуков"));
        when(rules.prepare(anyLong(), eq(5L), isNull())).thenReturn(prepared);
        when(storage.put(any(), any(), any(), anyLong())).thenReturn("new-key");
        when(persistence.create(anyLong(), anyLong(), any(), any(), anyBoolean(), anyBoolean(), any(), any()))
                .thenReturn(new DocumentPersistenceService.CreatedVersion(1, 2, 1, "attempt-1"));

        service.create(user(), new CreateDocumentRequest(null, " ", Document.Visibility.PRIVATE, false, null), multipart);

        verify(persistence).create(10L, 7L, "О закупке ноутбуков", Document.Visibility.PRIVATE, false, true,
                prepared, new DocumentPersistenceService.NewFile("new-key", "scan_17.pdf", "application/pdf", 1));
    }

    @Test
    void sensitiveDocumentNeedsExplicitTypeBecauseTextNeverReachesModel() {
        MockMultipartFile multipart = new MockMultipartFile("main", "memo.pdf", "application/pdf", new byte[]{1});
        when(fileValidator.validateMain(multipart))
                .thenReturn(new DocumentFileValidator.ValidatedFile(new byte[]{1}, "memo.pdf", "application/pdf"));

        assertThatThrownBy(() -> service.create(user(),
                new CreateDocumentRequest(null, "Записка", Document.Visibility.PRIVATE, true, Map.of()), multipart))
                .isInstanceOf(DocumentApiException.class)
                .satisfies(exception -> assertThat(((DomainException) exception).code()).isEqualTo("VALIDATION_FAILED"));
        verify(typeGuess, never()).guess(any(), any());
        verify(storage, never()).put(any(), any(), any(), anyLong());
    }

    @Test
    void titleFallsBackToFileNameWithoutModel() {
        assertThat(DocumentCommandService.titleOrFileName(null, "Приказ_о_премии.docx")).isEqualTo("Приказ о премии");
        assertThat(DocumentCommandService.titleOrFileName("  ", ".docx")).isEqualTo(".docx");
        assertThat(DocumentCommandService.titleOrFileName("О закупке", "x.pdf")).isEqualTo("О закупке");
        assertThat(DocumentCommandService.titleOrFileName(null, null)).isEqualTo("Документ");
    }

    @Test
    void hidesPrivateDocumentFromSameCompanyNonAuthor() {
        Document document = document(9L);
        when(documents.findById(1L)).thenReturn(Optional.of(document));
        when(documentReads.canRead(1L, 10L, 7L)).thenReturn(false);

        assertThatThrownBy(() -> service.createVersion(
                1L, user(), new CreateVersionRequest(Map.of(), false, List.of()), null))
                .isInstanceOf(NotFoundException.class)
                .satisfies(exception -> assertThat(((DomainException) exception).code())
                        .isEqualTo("NOT_FOUND"));
    }

    @Test
    void forbidsModificationWhenNonAuthorCanReadDocument() {
        Document document = document(9L);
        when(documents.findById(1L)).thenReturn(Optional.of(document));
        when(documentReads.canRead(1L, 10L, 7L)).thenReturn(true);

        assertThatThrownBy(() -> service.createVersion(
                1L, user(), new CreateVersionRequest(Map.of(), false, List.of()), null))
                .isInstanceOf(DocumentApiException.class)
                .satisfies(exception -> assertThat(((DomainException) exception).code())
                        .isEqualTo("FORBIDDEN"));
    }

    private CreateDocumentRequest request() {
        return new CreateDocumentRequest(5L, "Записка", Document.Visibility.PRIVATE, false, Map.of());
    }

    /** Ревью #103: «Проверить заново» — только правила по сохранённым полям, модель и файл не трогаются. */
    @Test
    void recheckRunsRulesOnStoredFieldsWithoutTheModel() {
        Document document = new Document();
        document.setId(1L);
        document.setOrgId(10L);
        document.setAuthorId(7L);
        document.setDocumentTypeId(5L);
        when(documents.findById(1L)).thenReturn(Optional.of(document));
        when(rules.prepare(10L, 5L, Map.of())).thenReturn(prepared());

        service.recheck(1L, 1, user());

        verify(persistence).recheck(eq(1L), eq(1), eq(10L), eq(7L), eq(5L), any());
        verify(analysis, never()).analyze(anyLong(), anyBoolean(), any());
        verify(storage, never()).get(any());
    }

    @Test
    void recheckOfAForeignCompanysDocumentIsNotFound() {
        Document foreign = new Document();
        foreign.setId(2L);
        foreign.setOrgId(99L);
        foreign.setAuthorId(7L);
        foreign.setDocumentTypeId(5L);
        when(documents.findById(2L)).thenReturn(Optional.of(foreign));

        assertThatThrownBy(() -> service.recheck(2L, 1, user())).isInstanceOf(NotFoundException.class);
        verify(persistence, never()).recheck(anyLong(), org.mockito.ArgumentMatchers.anyInt(), anyLong(), anyLong(), anyLong(), any());
    }

    /** #59: название формы — указанное, иначе заголовок записки, иначе название типа. */
    @Test
    void formTitleFallsBackToSubjectThenTypeName() {
        DocumentType type = prepared().type();
        var withSubject = new DocumentRuleService.PreparedCheck(type, List.of(), Map.of("subject", " О закупке "), List.of());

        assertThat(DocumentCommandService.formTitle(" Моя записка ", withSubject)).isEqualTo("Моя записка");
        assertThat(DocumentCommandService.formTitle(null, withSubject)).isEqualTo("О закупке");
        assertThat(DocumentCommandService.formTitle("", prepared())).isEqualTo("Записка");
    }

    /** «Другой документ» (GENERIC) с #86 не is_generic, но формой он не бывает (ревью #59). */
    @Test
    void formOfOtherDocumentIsRejectedBeforeSaving() {
        DocumentType other = prepared().type();
        other.setCode("GENERIC");
        when(rules.prepare(10L, 5L, Map.of()))
                .thenReturn(new DocumentRuleService.PreparedCheck(other, List.of(), Map.of(), List.of()));

        assertThatThrownBy(() -> service.createForm(user(), new ru.sibvibe.approval.document.dto.CreateFormDocumentRequest(
                5L, null, Document.Visibility.PRIVATE, false, Map.of())))
                .isInstanceOf(DocumentApiException.class);
        verify(persistence, never()).createForm(anyLong(), anyLong(), any(), any(), anyBoolean(), any());
    }

    private CurrentUser user() {
        var identity = new CurrentUser.UserIdentity(7, "Автор");
        return new CurrentUser(identity, identity, 8L, 10L, Set.of(), false, null);
    }

    private Document document(long authorId) {
        Document document = new Document();
        document.setId(1L);
        document.setOrgId(10L);
        document.setAuthorId(authorId);
        return document;
    }

    private DocumentRuleService.PreparedCheck prepared() {
        DocumentType type = new DocumentType();
        type.setId(5L);
        type.setCode("MEMO");
        type.setName("Записка");
        return new DocumentRuleService.PreparedCheck(type, List.of(), Map.of(), List.of());
    }
}
