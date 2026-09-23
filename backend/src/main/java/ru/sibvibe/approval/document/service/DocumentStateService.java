package ru.sibvibe.approval.document.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.common.api.NotFoundException;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.document.entity.Document;
import ru.sibvibe.approval.document.entity.DocumentVersion;
import ru.sibvibe.approval.document.repository.DocumentReadRepository;
import ru.sibvibe.approval.document.repository.DocumentRepository;
import ru.sibvibe.approval.document.repository.DocumentTypeRepository;
import ru.sibvibe.approval.document.repository.DocumentVersionRepository;

import java.time.Clock;
import java.util.Optional;

/**
 * Единственное место, где меняется статус документа при согласовании. Модуль approval вызывает только этот
 * сервис и в сущность {@code Document} напрямую не пишет (ARCHITECTURE.md, раздел 2).
 *
 * Все изменения идут в транзакции вызывающего под блокировкой строки документа ({@code SELECT … FOR UPDATE}):
 * параллельные отправка, решения и новая версия выполняются по очереди. Переходы — по таблице
 * «Состояния документа» (ARCHITECTURE.md, раздел 4); недопустимый переход даёт 409 {@code INVALID_STATE}.
 */
@Service
public class DocumentStateService {

    private final DocumentRepository documentRepository;
    private final DocumentVersionRepository versionRepository;
    private final DocumentTypeRepository typeRepository;
    private final DocumentReadRepository readRepository;
    private final Clock clock;

    public DocumentStateService(
            DocumentRepository documentRepository,
            DocumentVersionRepository versionRepository,
            DocumentTypeRepository typeRepository,
            DocumentReadRepository readRepository,
            Clock clock
    ) {
        this.documentRepository = documentRepository;
        this.versionRepository = versionRepository;
        this.typeRepository = typeRepository;
        this.readRepository = readRepository;
        this.clock = clock;
    }

    /**
     * Блокирует документ и проверяет, что вызывающий — его автор. Сначала — членство в компании (без неё 403 на любой
     * id, чтобы по ответу нельзя было узнать, существует ли документ), затем документ: чужой выглядит несуществующим
     * (404), а тот, кто его видит, но не автор, получает 403 (ARCHITECTURE.md; те же правила, что у новой версии).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public DocumentSnapshot lockForAuthor(long documentId, CurrentUser user, String forbiddenMessage) {
        requireMember(user);
        Document document = documentRepository.findByIdForUpdate(documentId).orElseThrow(NotFoundException::new);
        requireAuthor(document, user, forbiddenMessage);
        return snapshot(document);
    }

    /** То же без блокировки: для предпросмотра, который ничего не меняет. */
    @Transactional(readOnly = true)
    public DocumentSnapshot authorSnapshot(long documentId, CurrentUser user, String forbiddenMessage) {
        requireMember(user);
        Document document = documentRepository.findById(documentId).orElseThrow(NotFoundException::new);
        requireAuthor(document, user, forbiddenMessage);
        return snapshot(document);
    }

    /**
     * Блокирует документ по решению согласующего. Доступ определён шагом решающего, поэтому здесь проверяется
     * только принадлежность его компании: чужая компания — 404.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public DocumentSnapshot lockInOrg(long documentId, long orgId) {
        Document document = documentRepository.findByIdForUpdate(documentId).orElseThrow(NotFoundException::new);
        if (!document.getOrgId().equals(orgId)) {
            throw new NotFoundException();
        }
        return snapshot(document);
    }

    /** Причина, по которой версию нельзя отправить; пусто — можно. */
    @Transactional(readOnly = true)
    public Optional<DocumentCheckRules.Reason> submissionBlocker(long documentId, int versionNo) {
        Document document = documentRepository.findById(documentId).orElseThrow(NotFoundException::new);
        boolean generic = typeRepository.findById(document.getDocumentTypeId()).orElseThrow().isGeneric();
        DocumentVersion version = versionRepository.findByDocumentIdAndVersionNo(documentId, versionNo)
                .orElseThrow(NotFoundException::new);
        return DocumentCheckRules.blockReason(generic, version.getCheckStatus(), version.getValidationIssues());
    }

    /** {@code DRAFT → IN_APPROVAL}: отправка. Этап {@code null} допустим, если сразу следует {@link #approve}. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void moveToApproval(long documentId, Integer stageOrder) {
        Document document = locked(documentId);
        require(document, Document.Status.DRAFT, "Отправить можно только черновик");
        document.setStatus(Document.Status.IN_APPROVAL);
        document.setCurrentStage(stageOrder);
        touch(document);
    }

    /** Активным становится следующий этап; статус остаётся {@code IN_APPROVAL}. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void advanceStage(long documentId, int stageOrder) {
        Document document = locked(documentId);
        require(document, Document.Status.IN_APPROVAL, "Документ не на согласовании");
        document.setCurrentStage(stageOrder);
        touch(document);
    }

    /** {@code IN_APPROVAL → APPROVED}: согласован последний этап; документ неизменяем. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void approve(long documentId) {
        finish(documentId, Document.Status.APPROVED);
    }

    /** {@code IN_APPROVAL → RETURNED}: автор исправляет и загружает новую версию. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void returnForRevision(long documentId) {
        finish(documentId, Document.Status.RETURNED);
    }

    /** {@code IN_APPROVAL → REJECTED}: окончательно. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void reject(long documentId) {
        finish(documentId, Document.Status.REJECTED);
    }

    private void finish(long documentId, Document.Status target) {
        Document document = locked(documentId);
        require(document, Document.Status.IN_APPROVAL, "Документ не на согласовании");
        document.setStatus(target);
        document.setCurrentStage(null);
        touch(document);
    }

    private Document locked(long documentId) {
        return documentRepository.findByIdForUpdate(documentId).orElseThrow(NotFoundException::new);
    }

    private static void require(Document document, Document.Status expected, String message) {
        if (document.getStatus() != expected) {
            throw DocumentApiException.invalidState(message);
        }
    }

    private void touch(Document document) {
        document.setUpdatedAt(clock.instant());
    }

    private static void requireMember(CurrentUser user) {
        if (user.orgId() == null || user.memberId() == null) {
            throw DocumentApiException.forbidden("Для работы с документами нужно состоять в компании");
        }
    }

    private void requireAuthor(Document document, CurrentUser user, String forbiddenMessage) {
        if (!document.getOrgId().equals(user.orgId())) {
            throw new NotFoundException();
        }
        if (!document.getAuthorId().equals(user.userId())) {
            if (!readRepository.canRead(document.getId(), user.orgId(), user.userId())) {
                throw new NotFoundException();
            }
            throw DocumentApiException.forbidden(forbiddenMessage);
        }
    }

    private static DocumentSnapshot snapshot(Document document) {
        return new DocumentSnapshot(document.getId(), document.getOrgId(), document.getAuthorId(),
                document.getDocumentTypeId(), DocumentState.of(document.getStatus()), document.getCurrentVersionNo(),
                document.getCurrentStage(), document.getTitle());
    }

    /**
     * Состояние документа на момент блокировки; сущность наружу не отдаётся. {@code title} нужен
     * {@code approval} только для названия документа в событиях уведомлений (issue #74) - не для
     * бизнес-логики маршрута.
     */
    public record DocumentSnapshot(
            long id,
            long orgId,
            long authorId,
            long documentTypeId,
            DocumentState status,
            int currentVersionNo,
            Integer currentStage,
            String title
    ) {
    }
}
