package ru.sibvibe.approval.ai.service;

import org.springframework.stereotype.Service;
import ru.sibvibe.approval.ai.DocumentExtractor;
import ru.sibvibe.approval.ai.TextExtractor;

import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class DocumentExtractionService {

    private final TextExtractor textExtractor;
    private final DocumentExtractor documentExtractor;
    private final TextMinimizer minimizer;
    private final SensitiveDataMasker masker;

    public DocumentExtractionService(
            TextExtractor textExtractor,
            DocumentExtractor documentExtractor,
            TextMinimizer minimizer,
            SensitiveDataMasker masker
    ) {
        this.textExtractor = textExtractor;
        this.documentExtractor = documentExtractor;
        this.minimizer = minimizer;
        this.masker = masker;
    }

    public DocumentExtractor.ExtractionResult extract(
            InputStream content,
            String mimeType,
            String documentTypeCode,
            List<DocumentExtractor.FieldSpec> schema
    ) {
        Optional<TextExtractor.ExtractedText> extracted = textExtractor.extract(content, mimeType);
        if (extracted.isEmpty()) {
            return unavailable();
        }
        TextExtractor.ExtractedText original = extracted.get();
        String minimized = minimizer.minimize(original.fullText(), schema);
        SensitiveDataMasker.MaskedText masked = masker.mask(minimized);
        DocumentExtractor.ExtractionResult model = documentExtractor.extract(
                new DocumentExtractor.ExtractionRequest(masked.text(), documentTypeCode, schema));
        if (!model.available()) {
            return model;
        }

        Map<String, DocumentExtractor.ExtractedField> restored = new LinkedHashMap<>();
        for (DocumentExtractor.FieldSpec spec : schema) {
            DocumentExtractor.ExtractedField field = model.fields().get(spec.fieldName());
            if (field == null) {
                continue;
            }
            String value = masked.restore(field.value());
            String quote = masked.restore(field.quote());
            VerifiedQuote verified = verifyQuote(original, quote);
            if (!verified.valid()) {
                quote = null;
            }
            restored.put(spec.fieldName(), new DocumentExtractor.ExtractedField(
                    value, quote, verified.valid() ? verified.page() : null));
        }
        return new DocumentExtractor.ExtractionResult(Map.copyOf(restored), true, model.providerId());
    }

    private VerifiedQuote verifyQuote(TextExtractor.ExtractedText text, String quote) {
        if (quote == null || quote.isBlank() || !text.fullText().contains(quote)) {
            return new VerifiedQuote(false, null);
        }
        if (!text.paged()) {
            return new VerifiedQuote(true, null);
        }
        for (int index = 0; index < text.pages().size(); index++) {
            if (text.pages().get(index).contains(quote)) {
                return new VerifiedQuote(true, index + 1);
            }
        }
        return new VerifiedQuote(false, null);
    }

    private DocumentExtractor.ExtractionResult unavailable() {
        return new DocumentExtractor.ExtractionResult(Map.of(), false, "none");
    }

    private record VerifiedQuote(boolean valid, Integer page) {}
}
