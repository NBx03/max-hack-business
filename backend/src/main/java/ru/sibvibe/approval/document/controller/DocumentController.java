package ru.sibvibe.approval.document.controller;

import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.document.dto.CreateDocumentRequest;
import ru.sibvibe.approval.document.dto.CreateVersionRequest;
import ru.sibvibe.approval.document.dto.DocumentCardResponse;
import ru.sibvibe.approval.document.dto.DocumentListResponse;
import ru.sibvibe.approval.document.dto.DocumentTypeResponse;
import ru.sibvibe.approval.document.dto.UpdateFieldsRequest;
import ru.sibvibe.approval.document.entity.Document;
import ru.sibvibe.approval.document.repository.DocumentReadRepository;
import ru.sibvibe.approval.document.service.DocumentApiException;
import ru.sibvibe.approval.document.service.DocumentCommandService;
import ru.sibvibe.approval.document.service.DocumentViewService;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class DocumentController {

    private final DocumentCommandService commandService;
    private final DocumentViewService viewService;

    public DocumentController(
            DocumentCommandService commandService,
            DocumentViewService viewService
    ) {
        this.commandService = commandService;
        this.viewService = viewService;
    }

    @GetMapping("/document-types")
    public List<DocumentTypeResponse> documentTypes() {
        return viewService.documentTypes();
    }

    @PostMapping(value = "/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentCardResponse create(
            @AuthenticationPrincipal CurrentUser currentUser,
            @Valid @RequestPart("meta") CreateDocumentRequest meta,
            @RequestPart("main") MultipartFile main,
            @RequestPart(value = "attachments", required = false) List<MultipartFile> attachments
    ) {
        rejectAttachments(attachments);
        return commandService.create(currentUser, meta, main);
    }

    @GetMapping("/documents")
    public DocumentListResponse documents(
            @AuthenticationPrincipal CurrentUser currentUser,
            @RequestParam DocumentReadRepository.Tab tab,
            @RequestParam(required = false) Document.Status status,
            @RequestParam(required = false) Long typeId,
            @RequestParam(required = false) Long authorId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        if (page < 0 || size < 1 || size > 100 || from != null && to != null && from.isAfter(to)) {
            throw DocumentApiException.validation("Некорректные параметры списка");
        }
        return viewService.list(currentUser, tab, status, typeId, authorId, from, to, page, size);
    }

    @GetMapping("/documents/{id}")
    public DocumentCardResponse card(
            @AuthenticationPrincipal CurrentUser currentUser,
            @PathVariable long id
    ) {
        return viewService.card(id, currentUser);
    }

    @PostMapping(value = "/documents/{id}/versions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DocumentCardResponse createVersion(
            @AuthenticationPrincipal CurrentUser currentUser,
            @PathVariable long id,
            @Valid @RequestPart("meta") CreateVersionRequest meta,
            @RequestPart(value = "main", required = false) MultipartFile main,
            @RequestPart(value = "attachments", required = false) List<MultipartFile> attachments
    ) {
        rejectAttachments(attachments);
        return commandService.createVersion(id, currentUser, meta, main);
    }

    @PutMapping("/documents/{id}/versions/{versionNo}/fields")
    public DocumentCardResponse.CheckResult updateFields(
            @AuthenticationPrincipal CurrentUser currentUser,
            @PathVariable long id,
            @PathVariable int versionNo,
            @Valid @org.springframework.web.bind.annotation.RequestBody UpdateFieldsRequest request
    ) {
        return commandService.updateFields(id, versionNo, currentUser, request);
    }

    private void rejectAttachments(List<MultipartFile> attachments) {
        if (attachments != null && attachments.stream().anyMatch(file -> !file.isEmpty())) {
            throw DocumentApiException.validation("Приложения пока не поддерживаются");
        }
    }
}
