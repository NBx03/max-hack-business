package ru.sibvibe.approval.common.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import ru.sibvibe.approval.security.DemoActAsForbiddenException;

@RestControllerAdvice
public class RestExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ApiError("NOT_FOUND", "Ресурс не найден"));
    }

    @ExceptionHandler(DemoActAsForbiddenException.class)
    public ResponseEntity<ApiError> demoActAsForbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ApiError(
                        "DEMO_ACT_AS_FORBIDDEN",
                        "Нельзя действовать от имени этого пользователя"));
    }
}
