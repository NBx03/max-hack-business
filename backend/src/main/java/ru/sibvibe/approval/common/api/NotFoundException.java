package ru.sibvibe.approval.common.api;

/** Ресурс отсутствует или недоступен в текущей конфигурации. */
public class NotFoundException extends RuntimeException {
    public NotFoundException() {
        super("Resource not found");
    }
}
