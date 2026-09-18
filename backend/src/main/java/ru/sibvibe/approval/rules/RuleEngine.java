package ru.sibvibe.approval.rules;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Детерминированная проверка документа по правилам.
 *
 * Ключевое архитектурное решение: нарушено правило или нет - решает этот код,
 * а не языковая модель. Отсюда три следствия:
 * 1) результат воспроизводим и покрывается обычными тестами;
 * 2) проверка работает при недоступной модели - достаточно полей, введённых вручную;
 * 3) каждое замечание по построению ссылается на правило, потому что правило его и породило.
 */
public interface RuleEngine {

    /**
     * Проверка относительно текущей даты часов движка, без цитат и страниц.
     * Для воспроизводимости между разными днями используйте перегрузку с контекстом.
     * @param fields значения полей: из модели, введённые автором вручную или смешанные
     * @param rules  правила, применимые к типу документа
     */
    List<ValidationIssue> validate(Map<String, String> fields, List<RequirementRule> rules);

    /**
     * Воспроизводимая проверка относительно явно переданной даты. Порядок замечаний
     * совпадает с порядком правил. Пустые значения (null, отсутствующие, blank)
     * проверяет только REQUIRED; остальные проверки их пропускают.
     * Ошибка конфигурации правила вызывает IllegalArgumentException даже для пустого поля.
     * Значения непустых полей не обрезаются и не меняют регистр.
     */
    List<ValidationIssue> validate(Map<String, String> fields, List<RequirementRule> rules,
                                   ValidationContext context);

    /** Цитата уже проверена вызывающим кодом; движок не извлекает и не придумывает её. */
    record FieldLocation(String quote, Integer page) {}

    /** Местоположения относятся именно к переданным значениям, ключ — имя поля. */
    record ValidationContext(LocalDate referenceDate, Map<String, FieldLocation> locations) {}

    /**
     * Требование к документу с обязательным указанием источника - это техническая
     * реализация требования кейса показывать основание ответа и дату его актуальности.
     *
     * @param kind          вид правила: закон, внутренний регламент или наше продуктовое допущение
     * @param check         какая проверка выполняется
     * @param expected      REQUIRED: не используется; DATE_FORMAT/DATE_NOT_FUTURE:
     *                      шаблон DateTimeFormatter (например dd.MM.uuuu), null/blank — ISO_LOCAL_DATE;
     *                      MATCHES_PATTERN: Java regex для всей строки;
     *                      MIN_LENGTH: неотрицательное целое число Unicode code points;
     *                      ONE_OF: непустой JSON-массив непустых строк, точное сравнение
     * @param sourceTitle   название источника
     * @param sourceUrl     ссылка; null допустим для внутреннего регламента
     * @param sourceRef     точное место: пункт, статья, раздел
     * @param sourceCheckedAt когда мы сверялись с источником
     */
    record RequirementRule(
            Long id,
            String documentTypeCode,
            String fieldName,
            String description,
            CheckType check,
            String expected,
            RuleKind kind,
            Severity severity,
            String sourceTitle,
            String sourceUrl,
            String sourceRef,
            Instant sourceCheckedAt
    ) {}

    /**
     * LEGAL - нормативный акт. INTERNAL_POLICY - регламент организации.
     * PRODUCT_RULE - наше допущение. Пользователь должен видеть разницу:
     * кейс требует отделять официальные требования от рекомендаций продукта.
     */
    enum RuleKind { LEGAL, INTERNAL_POLICY, PRODUCT_RULE }

    /** Набор проверок сознательно мал: расширяется по мере реальной надобности. */
    enum CheckType { REQUIRED, DATE_FORMAT, DATE_NOT_FUTURE, MATCHES_PATTERN, MIN_LENGTH, ONE_OF }

    /** BLOCKER мешает отправке, WARNING и INFO - нет. Решение всё равно за человеком. */
    enum Severity { BLOCKER, WARNING, INFO }

    /**
     * Замечание всегда несёт ruleId и источник - свободного текста модели здесь нет.
     *
     * quote и page - для навигации: перейти к месту в документе, где значение
     * найдено и оказалось неверным. Для замечаний вида "поле отсутствует" они
     * пустые по смыслу: у отсутствующего значения нет места в документе.
     * Движок правил их не вычисляет, а переносит из результата извлечения.
     */
    record ValidationIssue(
            Long ruleId,
            String fieldName,
            String message,
            Severity severity,
            RuleKind kind,
            String sourceTitle,
            String sourceUrl,
            String sourceRef,
            String quote,
            Integer page
    ) {}
}
