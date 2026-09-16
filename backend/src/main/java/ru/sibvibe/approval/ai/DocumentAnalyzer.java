package ru.sibvibe.approval.ai;

import java.util.List;

/**
 * Порт ИИ-разбора документа. Это контракт между Ильёй и Никитой:
 * стейт-машина согласования вызывает только этот интерфейс и не знает,
 * что под ним - GigaChat, YandexGPT, локальная модель или заглушка.
 *
 * Провайдер выбирается конфигурацией (app.ai.provider), а не правкой кода.
 * Реализация MVP - поверх Spring AI ChatClient; смена провайдера сводится
 * к замене стартера и настроек.
 */
public interface DocumentAnalyzer {

    /**
     * Разбирает документ и сверяет его с набором правил.
     *
     * Реализация обязана вернуть результат даже при недоступной модели:
     * детерминированные проверки правил выполняются локально и не зависят
     * от LLM. Исключение наружу не выбрасывается - недоступность модели
     * отражается в {@link AnalysisResult#degraded()}.
     *
     * @param request документ и применимые правила
     * @return извлечённые поля и замечания, каждое со ссылкой на правило
     */
    AnalysisResult analyze(AnalysisRequest request);

    /**
     * @param documentText     текст документа; null, если автор выставил флаг
     *                         чувствительных данных - тогда заполнены manualFields
     * @param manualFields     поля, введённые автором вручную
     * @param rules            правила, применимые к типу документа
     * @param documentTypeCode код типа документа
     */
    record AnalysisRequest(
            String documentText,
            List<ManualField> manualFields,
            List<Rule> rules,
            String documentTypeCode
    ) {}

    /**
     * @param ruleId      идентификатор строки RequirementRule
     * @param fieldName   проверяемое поле
     * @param description формулировка требования
     * @param required    обязательно ли поле
     */
    record Rule(Long ruleId, String fieldName, String description, boolean required) {}

    record ManualField(String fieldName, String value) {}

    /**
     * @param extractedFields поля, извлечённые из документа
     * @param findings        замечания; пустой список означает "проверено, замечаний нет"
     * @param degraded        true - модель была недоступна, выполнены только
     *                        детерминированные проверки. Интерфейс обязан показать
     *                        это пользователю и не выдавать результат за полную проверку
     * @param providerId      какой провайдер отработал; для журнала и отладки
     */
    record AnalysisResult(
            List<ExtractedField> extractedFields,
            List<Finding> findings,
            boolean degraded,
            String providerId
    ) {}

    record ExtractedField(String fieldName, String value, Double confidence) {}

    /**
     * Замечание всегда привязано к правилу (ruleId), а не является свободным
     * текстом модели - это техническая реализация требования кейса
     * "привязывайте ответы к источникам".
     *
     * @param origin откуда замечание: детерминированная проверка или модель
     */
    record Finding(Long ruleId, String fieldName, String message, Severity severity, Origin origin) {}

    enum Severity { BLOCKER, WARNING, INFO }

    /** RULE - проверка по правилу без LLM, MODEL - разбор моделью. */
    enum Origin { RULE, MODEL }
}
