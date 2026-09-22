package ru.sibvibe.approval.document.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import ru.sibvibe.approval.common.api.NotFoundException;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.document.dto.CreateDocumentRequest;
import ru.sibvibe.approval.document.dto.CreateVersionRequest;
import ru.sibvibe.approval.document.dto.DocumentCardResponse;
import ru.sibvibe.approval.document.dto.UpdateFieldsRequest;
import ru.sibvibe.approval.document.entity.Document;
import ru.sibvibe.approval.document.repository.DocumentReadRepository;
import ru.sibvibe.approval.document.repository.DocumentRepository;
import ru.sibvibe.approval.storage.FileStorage;

import java.io.ByteArrayInputStream;

@Service
public class DocumentCommandService {

    private static final Logger LOGGER = LoggerFactory.getLogger(DocumentCommandService.class);

    private final DocumentRepository documentRepository;
    private final DocumentReadRepository documentReadRepository;
    private final DocumentFileValidator fileValidator;
    private final DocumentRuleService ruleService;
    private final DocumentAnalysisService analysisService;
    private final DocumentPersistenceService persistenceService;
    private final DocumentViewService viewService;
    private final FileStorage fileStorage;

    public DocumentCommandService(
            DocumentRepository documentRepository,
            DocumentReadRepository documentReadRepository,
            DocumentFileValidator fileValidator,
            DocumentRuleService ruleService,
            DocumentAnalysisService analysisService,
            DocumentPersistenceService persistenceService,
            DocumentViewService viewService,
            FileStorage fileStorage
    ) {
        this.documentRepository = documentRepository;
        this.documentReadRepository = documentReadRepository;
        this.fileValidator = fileValidator;
        this.ruleService = ruleService;
        this.analysisService = analysisService;
        this.persistenceService = persistenceService;
        this.viewService = viewService;
        this.fileStorage = fileStorage;
    }

    public DocumentCardResponse create(
            CurrentUser currentUser,
            CreateDocumentRequest request,
            MultipartFile main
    ) {
        Membership membership = requireMembership(currentUser);
        DocumentRuleService.PreparedCheck prepared =
                ruleService.prepare(request.documentTypeId(), request.fields());
        DocumentFileValidator.ValidatedFile validated = fileValidator.validateMain(main);
        DocumentPersistenceService.NewFile stored = upload(validated);
        DocumentPersistenceService.CreatedVersion created;
        try {
            created = persistenceService.create(
                    membership.orgId(),
                    currentUser.userId(),
                    request.title(),
                    request.visibility(),
                    request.containsSensitive(),
                    prepared,
                    stored);
        } catch (RuntimeException exception) {
            compensate(stored.storageKey(), exception);
            throw exception;
        }
        runCheck(created.documentId(), created.checkAttempt(), request.containsSensitive(), prepared);
        return viewService.card(created.documentId(), currentUser);
    }

    public DocumentCardResponse createVersion(
            long documentId,
            CurrentUser currentUser,
            CreateVersionRequest request,
            MultipartFile main
    ) {
        Membership membership = requireMembership(currentUser);
        Document document = requireOwnedDocument(documentId, membership.orgId(), currentUser.userId());
        DocumentRuleService.PreparedCheck prepared =
                ruleService.prepare(document.getDocumentTypeId(), request.fields());
        DocumentPersistenceService.NewFile stored = main == null || main.isEmpty()
                ? null
                : upload(fileValidator.validateMain(main));
        DocumentPersistenceService.CreatedVersion created;
        try {
            created = persistenceService.createVersion(
                    documentId,
                    membership.orgId(),
                    currentUser.userId(),
                    document.getCurrentVersionNo(),
                    request.containsSensitive(),
                    request.keepFileIds(),
                    prepared,
                    stored);
        } catch (RuntimeException exception) {
            if (stored != null) {
                compensate(stored.storageKey(), exception);
            }
            throw exception;
        }
        runCheck(documentId, created.checkAttempt(), request.containsSensitive(), prepared);
        return viewService.card(documentId, currentUser);
    }

    public DocumentCardResponse.CheckResult updateFields(
            long documentId,
            int versionNo,
            CurrentUser currentUser,
            UpdateFieldsRequest request
    ) {
        Membership membership = requireMembership(currentUser);
        Document document = requireOwnedDocument(documentId, membership.orgId(), currentUser.userId());
        DocumentRuleService.PreparedCheck prepared =
                ruleService.prepare(document.getDocumentTypeId(), request.fields());
        DocumentPersistenceService.CheckAttempt attempt = persistenceService.beginFieldsUpdate(
                documentId,
                versionNo,
                membership.orgId(),
                currentUser.userId(),
                prepared);
        runManualCheck(documentId, attempt, prepared);
        return viewService.card(documentId, currentUser).check();
    }

    private DocumentPersistenceService.NewFile upload(DocumentFileValidator.ValidatedFile file) {
        String key = fileStorage.put(
                new ByteArrayInputStream(file.content()),
                file.fileName(),
                file.mimeType(),
                file.size());
        return new DocumentPersistenceService.NewFile(
                key, file.fileName(), file.mimeType(), file.size());
    }

    private void runCheck(
            long documentId,
            DocumentPersistenceService.CheckAttempt attempt,
            boolean containsSensitive,
            DocumentRuleService.PreparedCheck prepared
    ) {
        if (prepared.type().isGeneric()) {
            return;
        }
        DocumentRuleService.CheckData pending = ruleService.pending(prepared);
        try {
            persistenceService.completeCheck(
                    documentId,
                    attempt,
                    analysisService.analyze(attempt.versionId(), containsSensitive, prepared));
        } catch (RuntimeException exception) {
            LOGGER.error("Не удалось проверить правила для версии {}", attempt.versionId(), exception);
            persistenceService.failCheck(documentId, attempt, pending);
        }
    }

    private void runManualCheck(
            long documentId,
            DocumentPersistenceService.CheckAttempt attempt,
            DocumentRuleService.PreparedCheck prepared
    ) {
        DocumentRuleService.CheckData pending = ruleService.pending(prepared);
        try {
            persistenceService.completeCheck(documentId, attempt, ruleService.execute(prepared));
        } catch (RuntimeException exception) {
            LOGGER.error("Не удалось проверить правила для версии {}", attempt.versionId(), exception);
            persistenceService.failCheck(documentId, attempt, pending);
        }
    }

    private Document requireOwnedDocument(long documentId, long orgId, long userId) {
        Document document = documentRepository.findById(documentId).orElseThrow(NotFoundException::new);
        if (!document.getOrgId().equals(orgId)) {
            throw new NotFoundException();
        }
        if (!document.getAuthorId().equals(userId)) {
            if (!documentReadRepository.canRead(documentId, orgId, userId)) {
                throw new NotFoundException();
            }
            throw DocumentApiException.forbidden("Изменять документ может только автор");
        }
        return document;
    }

    private Membership requireMembership(CurrentUser user) {
        if (user.orgId() == null || user.memberId() == null) {
            throw DocumentApiException.forbidden("Для работы с документами нужно состоять в компании");
        }
        return new Membership(user.orgId());
    }

    private void compensate(String storageKey, RuntimeException original) {
        try {
            fileStorage.delete(storageKey);
        } catch (RuntimeException cleanupFailure) {
            original.addSuppressed(cleanupFailure);
            LOGGER.error("Не удалось удалить файл после ошибки сохранения метаданных", cleanupFailure);
        }
    }

    private record Membership(long orgId) {}
}
