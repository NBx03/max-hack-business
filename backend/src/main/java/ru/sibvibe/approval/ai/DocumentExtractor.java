package ru.sibvibe.approval.ai;

import java.util.List;
import java.util.Map;

/**
 * Порт извлечения структурированных данных из документа.
 *
 * Здесь и только здесь работает языковая модель. Она делает ровно одно:
 * превращает неструктурированный текст в набор полей. Решение о том,
 * нарушено ли требование, принимает {@code RuleEngine} детерминированным
 * кодом - модель к этому решению не допускается.
 *
 * Провайдер выбирается настройкой app.ai.provider. Реализация MVP -
 * поверх Spring AI ChatClient с GigaChat; смена на другого поставщика
 * не затрагивает ни одного доменного класса.
 */
public interface DocumentExtractor {

    /**
     * Никогда не выбрасывает исключение при недоступности модели:
     * возвращает результат с {@code available = false}. Сценарий обязан
     * продолжать работать без модели.
     */
    ExtractionResult extract(ExtractionRequest request);

    /**
     * @param maskedText текст документа, уже прошедший минимизацию и маскирование.
     *                   Сырой текст в этот порт не передаётся никогда
     * @param schema     какие поля ожидаются у этого типа документа
     */
    record ExtractionRequest(String maskedText, String documentTypeCode, List<FieldSpec> schema) {}

    /**
     * @param fieldName имя поля в схеме типа документа
     * @param type      ожидаемый тип значения: помогает модели и упрощает разбор
     * @param hint      короткая подсказка модели, чем это поле является в документе
     */
    record FieldSpec(String fieldName, FieldType type, String hint) {}

    enum FieldType { STRING, DATE, NUMBER, PERSON, ORGANIZATION }

    /**
     * @param fields    извлечённые значения; значения ещё маскированы,
     *                  восстановление происходит выше по стеку
     * @param available false - модель была недоступна. Не ошибка, а штатный режим:
     *                  проверка правил выполнится по полям, введённым вручную
     * @param providerId какой провайдер отработал, для журнала
     */
    record ExtractionResult(
            Map<String, String> fields,
            boolean available,
            String providerId
    ) {}
}
