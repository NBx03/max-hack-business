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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DocumentCommandServiceTest {

    private final DocumentRepository documents = mock(DocumentRepository.class);
    private final DocumentReadRepository documentReads = mock(DocumentReadRepository.class);
    private final DocumentFileValidator fileValidator = mock(DocumentFileValidator.class);
    private final DocumentRuleService rules = mock(DocumentRuleService.class);
    private final DocumentPersistenceService persistence = mock(DocumentPersistenceService.class);
    private final DocumentViewService views = mock(DocumentViewService.class);
    private final FileStorage storage = mock(FileStorage.class);
    private final DocumentCommandService service =
            new DocumentCommandService(
                    documents, documentReads, fileValidator, rules, persistence, views, storage);

    @Test
    void deletesNewObjectWhenMetadataTransactionFails() {
        MockMultipartFile multipart = new MockMultipartFile("main", "memo.pdf", "application/pdf", new byte[]{1});
        var validated = new DocumentFileValidator.ValidatedFile(new byte[]{1}, "memo.pdf", "application/pdf");
        var prepared = prepared();
        when(fileValidator.validateMain(multipart)).thenReturn(validated);
        when(rules.prepare(5, Map.of())).thenReturn(prepared);
        when(storage.put(any(), any(), any(), anyLong())).thenReturn("new-key");
        when(persistence.create(anyLong(), anyLong(), any(), any(), anyBoolean(), any(), any()))
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
        when(rules.prepare(5, Map.of())).thenReturn(prepared());
        when(storage.put(any(), any(), any(), anyLong()))
                .thenThrow(new FileStorageException("storage unavailable"));

        assertThatThrownBy(() -> service.create(user(), request(), multipart))
                .isInstanceOf(FileStorageException.class);

        verify(persistence, never()).create(anyLong(), anyLong(), any(), any(), anyBoolean(), any(), any());
    }

    @Test
    void ruleFailureLeavesPersistedVersionMarkedFailedAndReturnsCard() {
        MockMultipartFile multipart = new MockMultipartFile("main", "memo.pdf", "application/pdf", new byte[]{1});
        var validated = new DocumentFileValidator.ValidatedFile(new byte[]{1}, "memo.pdf", "application/pdf");
        var prepared = prepared();
        var pending = new DocumentRuleService.CheckData(false, List.of(), List.of());
        when(fileValidator.validateMain(multipart)).thenReturn(validated);
        when(rules.prepare(5, Map.of())).thenReturn(prepared);
        when(rules.pending(prepared)).thenReturn(pending);
        when(rules.execute(prepared)).thenThrow(new IllegalArgumentException("broken rule"));
        when(storage.put(any(), any(), any(), anyLong())).thenReturn("new-key");
        when(persistence.create(anyLong(), anyLong(), any(), any(), anyBoolean(), any(), any()))
                .thenReturn(new DocumentPersistenceService.CreatedVersion(1, 2, 1, "attempt-1"));
        when(views.card(1, user())).thenReturn(mock(DocumentCardResponse.class));

        service.create(user(), request(), multipart);

        verify(persistence).failCheck(
                1, new DocumentPersistenceService.CheckAttempt(2, "attempt-1"), pending);
        verify(storage, never()).delete("new-key");
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
