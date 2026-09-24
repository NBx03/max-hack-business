package ru.sibvibe.approval.document.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.common.api.NotFoundException;
import ru.sibvibe.approval.document.dto.DocumentCardResponse;
import ru.sibvibe.approval.document.entity.Document;
import ru.sibvibe.approval.document.entity.DocumentFile;
import ru.sibvibe.approval.document.entity.DocumentVersion;
import ru.sibvibe.approval.document.repository.DocumentFileRepository;
import ru.sibvibe.approval.document.repository.DocumentRepository;
import ru.sibvibe.approval.document.repository.DocumentVersionRepository;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static ru.sibvibe.approval.document.service.DocumentFileValidator.MAX_ATTACHMENTS;
import static ru.sibvibe.approval.document.service.DocumentFileValidator.MAX_FILE_SIZE;
import static ru.sibvibe.approval.document.service.DocumentFileValidator.MAX_VERSION_SIZE;

@Service
public class DocumentPersistenceService {

    private final DocumentRepository documentRepository;
    private final DocumentVersionRepository versionRepository;
    private final DocumentFileRepository fileRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public DocumentPersistenceService(
            DocumentRepository documentRepository,
            DocumentVersionRepository versionRepository,
            DocumentFileRepository fileRepository,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.documentRepository = documentRepository;
        this.versionRepository = versionRepository;
        this.fileRepository = fileRepository;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Transactional
    public CreatedVersion create(
            long orgId,
            long authorId,
            String title,
            Document.Visibility visibility,
            boolean containsSensitive,
            boolean typeAutoDetected,
            DocumentRuleService.PreparedCheck prepared,
            NewFile main
    ) {
        Instant now = clock.instant();
        Document document = new Document();
        document.setDocumentTypeId(prepared.type().getId());
        document.setTypeAutoDetected(typeAutoDetected);
        document.setAuthorId(authorId);
        document.setOrgId(orgId);
        document.setTitle(title.trim());
        document.setStatus(Document.Status.DRAFT);
        document.setCurrentVersionNo(1);
        document.setVisibility(visibility);
        document.setCreatedAt(now);
        document.setUpdatedAt(now);
        document = documentRepository.save(document);

        String checkToken = checkToken(prepared);
        DocumentVersion version = newVersion(
                document.getId(), 1, containsSensitive, authorId, now, prepared, checkToken);
        version = versionRepository.save(version);
        fileRepository.save(newFile(version.getId(), DocumentFile.Kind.MAIN, 0, main, now));
        return new CreatedVersion(document.getId(), version.getId(), 1, checkToken);
    }

    @Transactional
    public CreatedVersion createVersion(
            long documentId,
            long orgId,
            long authorId,
            int expectedCurrentVersion,
            boolean containsSensitive,
            List<Long> keepFileIds,
            DocumentRuleService.PreparedCheck prepared,
            NewFile newMain
    ) {
        Document document = documentRepository.findByIdForUpdate(documentId)
                .orElseThrow(NotFoundException::new);
        requireAuthor(document, orgId, authorId);
        if (document.getCurrentVersionNo() != expectedCurrentVersion) {
            throw DocumentApiException.invalidState("Документ уже был изменён");
        }
        if (document.getStatus() != Document.Status.DRAFT
                && document.getStatus() != Document.Status.RETURNED) {
            throw DocumentApiException.invalidState("В текущем статусе нельзя создать новую версию");
        }
        if (!document.getDocumentTypeId().equals(prepared.type().getId())) {
            throw DocumentApiException.validation("Тип документа не совпадает");
        }

        DocumentVersion current = versionRepository
                .findByDocumentIdAndVersionNo(documentId, document.getCurrentVersionNo())
                .orElseThrow();
        List<DocumentFile> currentFiles = fileRepository.findByVersionIdOrderByPosition(current.getId());
        Set<Long> requestedIds = new LinkedHashSet<>(keepFileIds);
        if (requestedIds.size() != keepFileIds.size()) {
            throw DocumentApiException.validation("Некорректный список сохраняемых файлов");
        }
        List<DocumentFile> kept = currentFiles.stream()
                .filter(file -> requestedIds.contains(file.getId()))
                .toList();
        if (kept.size() != requestedIds.size()) {
            throw DocumentApiException.validation("Некорректный список сохраняемых файлов");
        }
        long keptMain = kept.stream().filter(file -> file.getKind() == DocumentFile.Kind.MAIN).count();
        // У документов демо-песочницы файлов нет вовсе (DemoDocumentSeedService): новая версия без файла —
        // та же, что и у них, иначе возвращённый демо-документ нельзя было бы ни исправить, ни отправить заново.
        boolean fileless = currentFiles.isEmpty() && newMain == null;
        if (!fileless && ((newMain == null && keptMain != 1) || (newMain != null && keptMain != 0))) {
            throw DocumentApiException.validation("Для версии должен быть указан один основной файл");
        }
        validateVersionFiles(kept, newMain);

        int versionNo = document.getCurrentVersionNo() + 1;
        Instant now = clock.instant();
        String checkToken = checkToken(prepared);
        DocumentVersion version = versionRepository.save(newVersion(
                documentId, versionNo, containsSensitive, authorId, now, prepared, checkToken));
        List<DocumentFile> copies = new ArrayList<>();
        for (DocumentFile source : kept) {
            NewFile reused = new NewFile(
                    source.getStorageKey(), source.getFileName(), source.getMimeType(), source.getFileSize());
            copies.add(newFile(version.getId(), source.getKind(), source.getPosition(), reused, now));
        }
        if (newMain != null) {
            copies.add(newFile(version.getId(), DocumentFile.Kind.MAIN, 0, newMain, now));
        }
        fileRepository.saveAll(copies);

        // Основной файл тот же — поля прежней версии, в том числе ручные правки, переносятся, а правила
        // перепроверяют их без модели: файл не изменился, перечитывать нечего, а перечитывание стёрло бы
        // правки автора (тест 23.09, ревью #88). Сменился признак чувствительности или прежняя проверка
        // не выполнилась — обычная проверка.
        DocumentRuleService.CheckData previousFields = newMain == null
                && !containsSensitive
                && !current.isContainsSensitive()
                && ("CHECKED".equals(current.getCheckStatus()) || fileless)
                ? readCheckData(current)
                : null;

        document.setCurrentVersionNo(versionNo);
        document.setCurrentStage(null);
        document.setStatus(Document.Status.DRAFT);
        document.setUpdatedAt(now);
        return new CreatedVersion(documentId, version.getId(), versionNo, checkToken, previousFields);
    }

    @Transactional
    public FieldsUpdateAttempt beginFieldsUpdate(
            long documentId,
            int versionNo,
            long orgId,
            long authorId,
            DocumentRuleService.PreparedCheck prepared
    ) {
        Document document = documentRepository.findByIdForUpdate(documentId)
                .orElseThrow(NotFoundException::new);
        requireAuthor(document, orgId, authorId);
        if (document.getStatus() != Document.Status.DRAFT
                || document.getCurrentVersionNo() != versionNo) {
            throw DocumentApiException.invalidState("Поля можно менять только у текущего черновика");
        }
        if (!document.getDocumentTypeId().equals(prepared.type().getId()) || prepared.type().isGeneric()) {
            throw DocumentApiException.validation("У этого документа нет проверяемых полей");
        }
        DocumentVersion version = versionRepository.findByDocumentIdAndVersionNo(documentId, versionNo)
                .orElseThrow(NotFoundException::new);
        DocumentRuleService.CheckData previous = readCheckData(version);
        String checkToken = UUID.randomUUID().toString();
        writePending(version, prepared, checkToken);
        document.setUpdatedAt(clock.instant());
        return new FieldsUpdateAttempt(new CheckAttempt(version.getId(), checkToken), previous);
    }

    /**
     * «Проверить заново» (#90, ревью #103): сохранённые поля — по текущим правилам компании, без модели.
     *
     * Всё — в одной транзакции под блокировкой документа, а не «записать ожидание → проверить → сохранить», как
     * при правке полей: перепроверке не с чем приходить, кроме сохранённых полей, поэтому промежуточное состояние
     * без них не должно появляться ни на миг. Иначе второй параллельный запрос прочитал бы пустые поля первого
     * как «прежние», а ошибка правил оставила бы версию FAILED без полей. Модели и внешних вызовов здесь нет —
     * держать блокировку на время проверки можно.
     *
     * У RETURNED возвращённая версия остаётся в истории как есть: перепроверяется новая версия-черновик с теми же
     * файлами, полями и содержимым формы.
     *
     * @return номер проверенной версии
     */
    @Transactional
    public int recheck(
            long documentId,
            int versionNo,
            long orgId,
            long authorId,
            long documentTypeId,
            java.util.function.UnaryOperator<DocumentRuleService.CheckData> rules
    ) {
        Document document = documentRepository.findByIdForUpdate(documentId)
                .orElseThrow(NotFoundException::new);
        requireAuthor(document, orgId, authorId);
        if (document.getCurrentVersionNo() != versionNo) {
            throw DocumentApiException.invalidState("Документ уже был изменён — обновите экран");
        }
        if (document.getStatus() != Document.Status.DRAFT && document.getStatus() != Document.Status.RETURNED) {
            throw DocumentApiException.invalidState("Проверить заново можно черновик или возвращённый документ");
        }
        if (!document.getDocumentTypeId().equals(documentTypeId)) {
            throw DocumentApiException.invalidState("Документ уже был изменён — обновите экран");
        }
        DocumentVersion version = versionRepository.findByDocumentIdAndVersionNo(documentId, versionNo)
                .orElseThrow(NotFoundException::new);
        JsonNode stored = version.getExtractedFields();
        if (stored != null && stored.path("checkToken").isTextual()) {
            throw DocumentApiException.invalidState("Проверка ещё идёт — подождите несколько секунд");
        }
        DocumentRuleService.CheckData result = rules.apply(readCheckData(version));
        if (result == null) {
            throw DocumentApiException.validation("У этого документа нет проверяемых полей");
        }
        DocumentVersion target = version;
        Instant now = clock.instant();
        if (document.getStatus() == Document.Status.RETURNED) {
            target = new DocumentVersion();
            target.setDocumentId(documentId);
            target.setVersionNo(versionNo + 1);
            target.setContainsSensitive(version.isContainsSensitive());
            target.setContent(version.getContent() == null ? null : version.getContent().deepCopy());
            target.setCreatedBy(authorId);
            target.setCreatedAt(now);
            target = versionRepository.save(target);
            List<DocumentFile> copies = new ArrayList<>();
            for (DocumentFile source : fileRepository.findByVersionIdOrderByPosition(version.getId())) {
                NewFile reused = new NewFile(
                        source.getStorageKey(), source.getFileName(), source.getMimeType(), source.getFileSize());
                copies.add(newFile(target.getId(), source.getKind(), source.getPosition(), reused, now));
            }
            fileRepository.saveAll(copies);
            document.setCurrentVersionNo(versionNo + 1);
            document.setCurrentStage(null);
            document.setStatus(Document.Status.DRAFT);
        }
        target.setExtractedFields(fieldsJson(result, null));
        target.setValidationIssues(objectMapper.valueToTree(result.issues()));
        target.setCheckStatus("CHECKED");
        document.setUpdatedAt(now);
        return target.getVersionNo();
    }

    /**
     * Смена типа черновика (#86): модель могла определить вид неверно. Текущая версия
     * перепроверяется по схеме нового типа — новая попытка проверки со своим токеном.
     */
    @Transactional
    public RetypeAttempt beginRetype(
            long documentId,
            int versionNo,
            long orgId,
            long authorId,
            DocumentRuleService.PreparedCheck prepared
    ) {
        Document document = documentRepository.findByIdForUpdate(documentId)
                .orElseThrow(NotFoundException::new);
        requireAuthor(document, orgId, authorId);
        if (document.getStatus() != Document.Status.DRAFT || document.getCurrentVersionNo() != versionNo) {
            throw DocumentApiException.invalidState("Тип можно сменить только у текущего черновика");
        }
        DocumentVersion version = versionRepository.findByDocumentIdAndVersionNo(documentId, versionNo)
                .orElseThrow(NotFoundException::new);
        document.setDocumentTypeId(prepared.type().getId());
        document.setTypeAutoDetected(false);
        document.setUpdatedAt(clock.instant());
        String checkToken = UUID.randomUUID().toString();
        writePending(version, prepared, checkToken);
        return new RetypeAttempt(new CheckAttempt(version.getId(), checkToken), version.isContainsSensitive());
    }

    /**
     * Что нужно, чтобы вписать исправления в файл текущей версии: основной файл, приложения
     * (переходят в новую версию как есть) и значения полей, найденные в файле.
     */
    @Transactional(readOnly = true)
    public CorrectionSource correctionSource(long documentId, int versionNo, long orgId, long authorId) {
        Document document = documentRepository.findById(documentId).orElseThrow(NotFoundException::new);
        requireAuthor(document, orgId, authorId);
        if (document.getCurrentVersionNo() != versionNo) {
            throw DocumentApiException.invalidState("Документ уже был изменён — обновите экран");
        }
        if (document.getStatus() != Document.Status.DRAFT && document.getStatus() != Document.Status.RETURNED) {
            throw DocumentApiException.invalidState("Исправлять можно черновик или возвращённый документ");
        }
        DocumentVersion version = versionRepository.findByDocumentIdAndVersionNo(documentId, versionNo)
                .orElseThrow(NotFoundException::new);
        List<DocumentFile> files = fileRepository.findByVersionIdOrderByPosition(version.getId());
        DocumentFile main = files.stream()
                .filter(file -> file.getKind() == DocumentFile.Kind.MAIN)
                .findFirst()
                .orElseThrow(() -> DocumentApiException.validation("У документа нет основного файла"));
        List<Long> attachments = files.stream()
                .filter(file -> file.getKind() == DocumentFile.Kind.ATTACHMENT)
                .map(DocumentFile::getId)
                .toList();
        return new CorrectionSource(
                document.getDocumentTypeId(), version.isContainsSensitive(), main, attachments,
                readCheckData(version).fields());
    }

    @Transactional
    public boolean completeCheck(
            long documentId,
            CheckAttempt attempt,
            DocumentRuleService.CheckData result
    ) {
        documentRepository.findByIdForUpdate(documentId).orElseThrow(NotFoundException::new);
        DocumentVersion version = currentAttempt(documentId, attempt);
        if (version == null) {
            return false;
        }
        version.setExtractedFields(fieldsJson(result, null));
        version.setValidationIssues(objectMapper.valueToTree(result.issues()));
        version.setCheckStatus("CHECKED");
        return true;
    }

    @Transactional
    public boolean failCheck(
            long documentId,
            CheckAttempt attempt,
            DocumentRuleService.CheckData pending
    ) {
        documentRepository.findByIdForUpdate(documentId).orElseThrow(NotFoundException::new);
        DocumentVersion version = currentAttempt(documentId, attempt);
        if (version == null) {
            return false;
        }
        version.setExtractedFields(fieldsJson(pending, null));
        version.setValidationIssues(objectMapper.createArrayNode());
        version.setCheckStatus("FAILED");
        return true;
    }

    private DocumentVersion newVersion(
            long documentId,
            int versionNo,
            boolean containsSensitive,
            long authorId,
            Instant now,
            DocumentRuleService.PreparedCheck prepared,
            String checkToken
    ) {
        DocumentVersion version = new DocumentVersion();
        version.setDocumentId(documentId);
        version.setVersionNo(versionNo);
        version.setContainsSensitive(containsSensitive);
        version.setCreatedBy(authorId);
        version.setCreatedAt(now);
        if (!prepared.type().isGeneric()) {
            writePending(version, prepared, checkToken);
        }
        return version;
    }

    private void writePending(
            DocumentVersion version,
            DocumentRuleService.PreparedCheck prepared,
            String checkToken
    ) {
        DocumentRuleService.CheckData pending = new DocumentRuleService.CheckData(
                false,
                prepared.schema().stream()
                        .map(field -> new DocumentCardResponse.FieldValue(
                                field.getFieldName(),
                                prepared.suppliedFields().get(field.getFieldName()),
                                "MANUAL",
                                null,
                                null))
                        .toList(),
                List.of());
        version.setExtractedFields(fieldsJson(pending, checkToken));
        version.setValidationIssues(objectMapper.createArrayNode());
        version.setCheckStatus("FAILED");
    }

    private JsonNode fieldsJson(DocumentRuleService.CheckData data, String checkToken) {
        return objectMapper.valueToTree(
                new StoredFields(data.modelAvailable(), data.fields(), checkToken, data.textMissing()));
    }

    private DocumentRuleService.CheckData readCheckData(DocumentVersion version) {
        if (version.getExtractedFields() == null || version.getExtractedFields().isNull()) {
            return new DocumentRuleService.CheckData(false, List.of(), List.of());
        }
        StoredFields stored = objectMapper.convertValue(version.getExtractedFields(), StoredFields.class);
        return new DocumentRuleService.CheckData(
                stored.modelAvailable(),
                stored.fields() == null ? List.of() : List.copyOf(stored.fields()),
                List.of(),
                stored.textMissing());
    }

    private DocumentVersion currentAttempt(long documentId, CheckAttempt attempt) {
        DocumentVersion version = versionRepository.findById(attempt.versionId())
                .orElseThrow(NotFoundException::new);
        String storedToken = version.getExtractedFields() == null
                ? null
                : version.getExtractedFields().path("checkToken").textValue();
        if (!version.getDocumentId().equals(documentId) || !attempt.checkToken().equals(storedToken)) {
            return null;
        }
        return version;
    }

    private String checkToken(DocumentRuleService.PreparedCheck prepared) {
        return prepared.type().isGeneric() ? null : UUID.randomUUID().toString();
    }

    private DocumentFile newFile(
            long versionId,
            DocumentFile.Kind kind,
            int position,
            NewFile source,
            Instant now
    ) {
        DocumentFile file = new DocumentFile();
        file.setVersionId(versionId);
        file.setKind(kind);
        file.setPosition(position);
        file.setStorageKey(source.storageKey());
        file.setFileName(source.fileName());
        file.setMimeType(source.mimeType());
        file.setFileSize(source.size());
        file.setCreatedAt(now);
        return file;
    }

    private void requireAuthor(Document document, long orgId, long authorId) {
        if (!document.getOrgId().equals(orgId) || !document.getAuthorId().equals(authorId)) {
            throw new NotFoundException();
        }
    }

    private void validateVersionFiles(List<DocumentFile> kept, NewFile newMain) {
        long total = newMain == null ? 0 : newMain.size();
        int attachments = 0;
        for (DocumentFile file : kept) {
            if (file.getFileSize() <= 0 || file.getFileSize() > MAX_FILE_SIZE) {
                throw DocumentApiException.validation("Некорректный сохраняемый файл");
            }
            total += file.getFileSize();
            if (file.getKind() == DocumentFile.Kind.ATTACHMENT) {
                attachments++;
            }
        }
        if (attachments > MAX_ATTACHMENTS) {
            throw DocumentApiException.validation("В версии может быть не более 10 приложений");
        }
        if (total > MAX_VERSION_SIZE) {
            throw DocumentApiException.fileTooLarge("Размер файлов версии превышает 30 МБ");
        }
    }

    public record NewFile(String storageKey, String fileName, String mimeType, long size) {}

    /** previousFields — поля прежней версии, если основной файл не менялся: их перепроверяют без модели. */
    public record CreatedVersion(
            long documentId,
            long versionId,
            int versionNo,
            String checkToken,
            DocumentRuleService.CheckData previousFields
    ) {
        public CreatedVersion(long documentId, long versionId, int versionNo, String checkToken) {
            this(documentId, versionId, versionNo, checkToken, null);
        }

        public CheckAttempt checkAttempt() {
            return checkToken == null ? null : new CheckAttempt(versionId, checkToken);
        }
    }

    public record CheckAttempt(long versionId, String checkToken) {}

    public record FieldsUpdateAttempt(CheckAttempt checkAttempt, DocumentRuleService.CheckData previous) {}

    public record RetypeAttempt(CheckAttempt checkAttempt, boolean containsSensitive) {}

    public record CorrectionSource(
            long documentTypeId,
            boolean containsSensitive,
            DocumentFile main,
            List<Long> attachmentIds,
            List<DocumentCardResponse.FieldValue> fields
    ) {}

    /** textMissing отсутствует в версиях, сохранённых до #86, — тогда false. */
    public record StoredFields(
            boolean modelAvailable,
            List<DocumentCardResponse.FieldValue> fields,
            String checkToken,
            boolean textMissing
    ) {
        public StoredFields(boolean modelAvailable, List<DocumentCardResponse.FieldValue> fields, String checkToken) {
            this(modelAvailable, fields, checkToken, false);
        }
    }
}
