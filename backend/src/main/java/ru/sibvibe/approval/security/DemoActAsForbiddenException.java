package ru.sibvibe.approval.security;

/** Запрошенный демо-персонаж не принадлежит песочнице вызывающего. */
public class DemoActAsForbiddenException extends RuntimeException {
    public DemoActAsForbiddenException() {
        super("Demo impersonation is forbidden");
    }
}
