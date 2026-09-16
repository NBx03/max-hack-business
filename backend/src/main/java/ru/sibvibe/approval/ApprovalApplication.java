package ru.sibvibe.approval;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Точка входа бэкенда.
 *
 * Бизнес-логика намеренно отсутствует: этот коммит - только каркас.
 * Раскладка пакетов, контракты между Ильёй и Никитой и принятые
 * архитектурные решения описаны в CLAUDE.md в корне репозитория.
 */
@SpringBootApplication
public class ApprovalApplication {

    public static void main(String[] args) {
        SpringApplication.run(ApprovalApplication.class, args);
    }
}
