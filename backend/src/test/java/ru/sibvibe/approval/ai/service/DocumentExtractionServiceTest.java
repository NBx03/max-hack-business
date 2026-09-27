package ru.sibvibe.approval.ai.service;

import org.junit.jupiter.api.Test;
import ru.sibvibe.approval.ai.DocumentExtractor;
import ru.sibvibe.approval.ai.TextExtractor;

import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

class DocumentExtractionServiceTest {

    private static final DocumentExtractor.FieldSpec FIELD = new DocumentExtractor.FieldSpec(
            "inn", DocumentExtractor.FieldType.STRING, "ИНН заявителя");

    @Test
    void restoresMaskedValueAndAcceptsOnlyExactQuote() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("ИНН заявителя 1234567890"), true));
        DocumentExtractor model = extractor(
                request -> {
                    assertThat(request.maskedText()).contains("<INN_1>").doesNotContain("1234567890");
                    return new DocumentExtractor.ExtractionResult(Map.of(
                            "inn", new DocumentExtractor.ExtractedField("<INN_1>", "ИНН заявителя <INN_1>", 99)),
                            true, "test");
                },
                request -> new DocumentExtractor.SummaryResult("Документ касается <INN_1> и подан 15.09.2026.", true));
        var service = service(text, model);

        var result = service.extract(new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.available()).isTrue();
        assertThat(result.fields().get("inn"))
                .isEqualTo(new DocumentExtractor.ExtractedField("1234567890", "ИНН заявителя 1234567890", 1));
        // Даты в сводке тоже обязаны быть в исходном тексте, поэтому вся сводка отклонена.
        assertThat(result.summary()).isNull();
    }

    @Test
    void restoresMaskedSummaryWhenEveryNumberOccursVerbatim() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("ИНН заявителя 1234567890. Срок исполнения 15.09.2026."), true));
        DocumentExtractor model = extractor(
                request -> new DocumentExtractor.ExtractionResult(Map.of(
                        "inn", new DocumentExtractor.ExtractedField("<INN_1>", "ИНН заявителя <INN_1>", 1)),
                        true, "test"),
                request -> new DocumentExtractor.SummaryResult(
                        "Документ касается <INN_1>. Срок исполнения — 15.09.2026.", true));

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.summary())
                .isEqualTo("Документ касается 1234567890. Срок исполнения — 15.09.2026.");
    }

    @Test
    void discardsEntireSummaryWhenModelInventsNumber() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("Срок исполнения 15.09.2026, сумма 1000 рублей."), true));
        DocumentExtractor model = extractor(
                request -> new DocumentExtractor.ExtractionResult(Map.of(), true, "test"),
                request -> new DocumentExtractor.SummaryResult(
                        "Исполнить до 15.09.2026. Сумма составляет 2000 рублей.", true));

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.summary()).isNull();
    }

    @Test
    void doesNotAskModelForSummaryWhenFieldsExtractionFailed() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("ИНН заявителя 1234567890"), true));
        DocumentExtractor model = extractor(
                request -> new DocumentExtractor.ExtractionResult(Map.of(), false, "gigachat"),
                request -> {
                    throw new AssertionError("сводка не нужна, если поля не извлеклись");
                });

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.available()).isFalse();
    }

    @Test
    void requiresWholeNumericTokensWordMonthAndResolvedPlaceholders() {
        String source = "Срок 15.09.2026, сумма 1000 рублей. Начало с 1 ноября 2026 года. Лимит 1 000.";

        assertThat(DocumentExtractionService.summarySupportedBy("Сумма 100 рублей.", source)).isFalse();
        assertThat(DocumentExtractionService.summarySupportedBy("Касается 5 сотрудников.", source)).isFalse();
        assertThat(DocumentExtractionService.summarySupportedBy("Начало 1 октября 2026 года.", source)).isFalse();
        assertThat(DocumentExtractionService.summarySupportedBy("Документ подписал <PERSON_9>.", source)).isFalse();
        assertThat(DocumentExtractionService.summarySupportedBy(
                "Начало 1 ноября 2026 года. Лимит 1 000.", source)).isTrue();
    }

    @Test
    void discardsFabricatedQuoteButKeepsExtractedValue() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("ИНН заявителя 1234567890"), true));
        DocumentExtractor model = fieldsOnly(request -> new DocumentExtractor.ExtractionResult(Map.of(
                "inn", new DocumentExtractor.ExtractedField("<INN_1>", "выдуманная цитата", 1)),
                true, "test"));

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.fields().get("inn"))
                .isEqualTo(new DocumentExtractor.ExtractedField("1234567890", null, null));
    }

    @Test
    void keepsVerifiedDocxQuoteWithoutInventingPageNumber() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("ИНН заявителя 1234567890"), false));
        DocumentExtractor model = fieldsOnly(request -> new DocumentExtractor.ExtractionResult(Map.of(
                "inn", new DocumentExtractor.ExtractedField("<INN_1>", "ИНН заявителя <INN_1>", 1)),
                true, "test"));

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "docx", "TYPE", List.of(FIELD));

        assertThat(result.fields().get("inn").quote()).isEqualTo("ИНН заявителя 1234567890");
        assertThat(result.fields().get("inn").page()).isNull();
    }

    /** Скан без текстового слоя: в модель ничего не уходит, иначе «не найдено» по каждому полю. */
    @Test
    void scannedPdfWithoutTextIsNotSentToModelAndIsMarkedAsTextMissing() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(List.of(" ", "1", "2 "), true));
        DocumentExtractor model = extractor(
                request -> {
                    throw new AssertionError("модель не должна вызываться для файла без текста");
                },
                request -> {
                    throw new AssertionError("модель не должна вызываться для файла без текста");
                });

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.available()).isFalse();
        assertThat(result.textMissing()).isTrue();
        assertThat(result.fields()).isEmpty();
    }

    @Test
    void acceptsQuoteWhoseLineBreakModelReturnedAsSpaceAndKeepsDocumentText() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("Шапка", "ИНН заявителя\n  1234567890"), true));
        DocumentExtractor model = fieldsOnly(request -> new DocumentExtractor.ExtractionResult(Map.of(
                "inn", new DocumentExtractor.ExtractedField("<INN_1>", "ИНН заявителя <INN_1>", 1)),
                true, "test"));

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.fields().get("inn"))
                .isEqualTo(new DocumentExtractor.ExtractedField("1234567890", "ИНН заявителя\n  1234567890", 2));
    }

    private DocumentExtractionService service(TextExtractor text, DocumentExtractor model) {
        return new DocumentExtractionService(text, model,
                request -> new ru.sibvibe.approval.ai.DocumentClassifier.Classification(null, null, false),
                new TextMinimizer(), new SensitiveDataMasker());
    }

    /** Сводка (#92) — отдельный вызов; когда тест её не проверяет, она просто «недоступна». */
    private static DocumentExtractor fieldsOnly(
            Function<DocumentExtractor.ExtractionRequest, DocumentExtractor.ExtractionResult> extract
    ) {
        return extractor(extract, request -> new DocumentExtractor.SummaryResult(null, false));
    }

    private static DocumentExtractor extractor(
            Function<DocumentExtractor.ExtractionRequest, DocumentExtractor.ExtractionResult> extract,
            Function<DocumentExtractor.SummaryRequest, DocumentExtractor.SummaryResult> summarize
    ) {
        return new DocumentExtractor() {
            @Override
            public ExtractionResult extract(ExtractionRequest request) {
                return extract.apply(request);
            }

            @Override
            public SummaryResult summarize(SummaryRequest request) {
                return summarize.apply(request);
            }
        };
    }
}
