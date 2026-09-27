package ru.sibvibe.approval.document.service;

import org.springframework.http.HttpStatus;
import ru.sibvibe.approval.common.api.DomainException;

public final class DocumentApiException extends DomainException {

    private DocumentApiException(String code, HttpStatus status, String message) {
        super(code, status, message);
    }

    public static DocumentApiException validation(String message) {
        return new DocumentApiException("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, message);
    }

    public static DocumentApiException invalidState(String message) {
        return new DocumentApiException("INVALID_STATE", HttpStatus.CONFLICT, message);
    }

    public static DocumentApiException fileTypeNotAllowed(String message) {
        return new DocumentApiException("FILE_TYPE_NOT_ALLOWED", HttpStatus.BAD_REQUEST, message);
    }

    /**
     * Содержимое основного файла не читается: пустой, битый PDF, опасный DOCX. Отдельный код, чтобы экран показал ошибку
     * у зоны файла и убрал его, как у FILE_TYPE_NOT_ALLOWED и FILE_TOO_LARGE (ревью #122, п. 3).
     */
    public static DocumentApiException fileInvalid(String message) {
        return new DocumentApiException("FILE_INVALID", HttpStatus.BAD_REQUEST, message);
    }

    public static DocumentApiException fileTooLarge(String message) {
        return new DocumentApiException("FILE_TOO_LARGE", HttpStatus.PAYLOAD_TOO_LARGE, message);
    }

    public static DocumentApiException forbidden(String message) {
        return new DocumentApiException("FORBIDDEN", HttpStatus.FORBIDDEN, message);
    }
}
