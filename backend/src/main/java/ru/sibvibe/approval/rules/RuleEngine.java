package ru.sibvibe.approval.rules;

import java.time.Instant;
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
     * @param fields значения полей: из модели, введённые автором вручную или смешанные
     * @param rules  правила, применимые к типу документа
     */
    List<ValidationIssue> validate(Map<String, String> fields, List<RequirementRule> rules);

    /**
     * Требование к документу с обязательным указанием источника - это техническая
     * реализация требования кейса показывать основание ответа и дату его актуальности.
     *
     * @param kind          вид правила: закон, внутренний регламент или наше продуктовое допущение
     * @param check         какая проверка выполняется
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
