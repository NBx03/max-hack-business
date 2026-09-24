package ru.sibvibe.approval.ai.service;

import org.junit.jupiter.api.Test;
import ru.sibvibe.approval.ai.DocumentExtractor;
import ru.sibvibe.approval.ai.TextExtractor;

import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class DocumentExtractionServiceTest {

    private static final DocumentExtractor.FieldSpec FIELD = new DocumentExtractor.FieldSpec(
            "inn", DocumentExtractor.FieldType.STRING, "ИНН заявителя");

    @Test
    void restoresMaskedValueAndAcceptsOnlyExactQuote() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("ИНН заявителя 1234567890"), true));
        DocumentExtractor model = request -> {
            assertThat(request.maskedText()).contains("<INN_1>").doesNotContain("1234567890");
            return new DocumentExtractor.ExtractionResult(Map.of(
                    "inn", new DocumentExtractor.ExtractedField("<INN_1>", "ИНН заявителя <INN_1>", 99)),
                    true, "test");
        };
        var service = service(text, model);

        var result = service.extract(new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.available()).isTrue();
        assertThat(result.fields().get("inn"))
                .isEqualTo(new DocumentExtractor.ExtractedField("1234567890", "ИНН заявителя 1234567890", 1));
    }

    @Test
    void discardsFabricatedQuoteButKeepsExtractedValue() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("ИНН заявителя 1234567890"), true));
        DocumentExtractor model = request -> new DocumentExtractor.ExtractionResult(Map.of(
                "inn", new DocumentExtractor.ExtractedField("<INN_1>", "выдуманная цитата", 1)),
                true, "test");

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.fields().get("inn"))
                .isEqualTo(new DocumentExtractor.ExtractedField("1234567890", null, null));
    }

    @Test
    void keepsVerifiedDocxQuoteWithoutInventingPageNumber() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("ИНН заявителя 1234567890"), false));
        DocumentExtractor model = request -> new DocumentExtractor.ExtractionResult(Map.of(
                "inn", new DocumentExtractor.ExtractedField("<INN_1>", "ИНН заявителя <INN_1>", 1)),
                true, "test");

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "docx", "TYPE", List.of(FIELD));

        assertThat(result.fields().get("inn").quote()).isEqualTo("ИНН заявителя 1234567890");
        assertThat(result.fields().get("inn").page()).isNull();
    }

    /** Скан без текстового слоя: в модель ничего не уходит, иначе «не найдено» по каждому полю. */
    @Test
    void scannedPdfWithoutTextIsNotSentToModelAndIsMarkedAsTextMissing() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(List.of(" ", "1", "2 "), true));
        DocumentExtractor model = request -> {
            throw new AssertionError("модель не должна вызываться для файла без текста");
        };

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.available()).isFalse();
        assertThat(result.textMissing()).isTrue();
        assertThat(result.fields()).isEmpty();
    }

    @Test
    void acceptsQuoteWhoseLineBreakModelReturnedAsSpaceAndKeepsDocumentText() {
        TextExtractor text = (content, mime) -> Optional.of(new TextExtractor.ExtractedText(
                List.of("Шапка", "ИНН\u00A0заявителя\n  1234567890"), true));
        DocumentExtractor model = request -> new DocumentExtractor.ExtractionResult(Map.of(
                "inn", new DocumentExtractor.ExtractedField("<INN_1>", "ИНН заявителя <INN_1>", 1)),
                true, "test");

        var result = service(text, model).extract(
                new ByteArrayInputStream(new byte[0]), "application/pdf", "TYPE", List.of(FIELD));

        assertThat(result.fields().get("inn"))
                .isEqualTo(new DocumentExtractor.ExtractedField("1234567890", "ИНН\u00A0заявителя\n  1234567890", 2));
    }

    private DocumentExtractionService service(TextExtractor text, DocumentExtractor model) {
        return new DocumentExtractionService(text, model,
                request -> new ru.sibvibe.approval.ai.DocumentClassifier.Classification(null, null, false),
                new TextMinimizer(), new SensitiveDataMasker());
    }
}
