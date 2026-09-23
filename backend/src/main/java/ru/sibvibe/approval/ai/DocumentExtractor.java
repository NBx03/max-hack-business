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
     * @param fields    извлечённые поля по имени; значения ещё маскированы,
     *                  восстановление происходит выше по стеку
     * @param available false - модель была недоступна. Не ошибка, а штатный режим:
     *                  проверка правил выполнится по полям, введённым вручную
     * @param providerId какой провайдер отработал, для журнала; {@link #NO_TEXT} — в файле нет текста
     */
    record ExtractionResult(
            Map<String, ExtractedField> fields,
            boolean available,
            String providerId
    ) {
        public boolean textMissing() {
            return NO_TEXT.equals(providerId);
        }
    }

    /**
     * В файле нет текстового слоя — обычно это скан. Модель не вызывается: пустой текст дал бы
     * «не найдено» по каждому полю, как будто документ пустой.
     */
    String NO_TEXT = "no-text";

    /**
     * Цитата нужна, чтобы показать пользователю, откуда взято значение, и перейти
     * к нужному месту в документе.
     *
     * Защита от выдумки модели: реализация обязана проверить, что цитата дословно
     * встречается в исходном тексте. Не нашлась - цитата и страница обнуляются,
     * значение остаётся, но без "доказательства". Показывать пользователю
     * непроверенную цитату нельзя.
     *
     * @param value значение поля; null, если модель поле в документе не нашла
     * @param quote дословный фрагмент исходного текста, из которого взято значение
     * @param page  номер страницы, если формат документа позволяет его определить
     */
    record ExtractedField(String value, String quote, Integer page) {}
}
