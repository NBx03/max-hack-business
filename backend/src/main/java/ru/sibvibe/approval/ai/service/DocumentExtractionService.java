package ru.sibvibe.approval.ai.service;

import org.springframework.stereotype.Service;
import ru.sibvibe.approval.ai.DocumentClassifier;
import ru.sibvibe.approval.ai.DocumentExtractor;
import ru.sibvibe.approval.ai.TextExtractor;

import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class DocumentExtractionService {

    /** Вид документа понятен по началу: заголовок, адресат, первые абзацы. Минимизация — и здесь. */
    private static final int CLASSIFICATION_TEXT_LIMIT = 4_000;
    /**
     * Меньше букв — считаем, что текста нет: у скана PDF текстового слоя нет вовсе или в нём только
     * номера страниц и мусор распознавания.
     */
    private static final int MIN_TEXT_LETTERS = 10;
    /** Любые пробелы, включая неразрывный и перевод строки. */
    private static final String WHITESPACE = "[\\s\\u00A0]+";
    /** Целое число, дата, сумма или другой числовой фрагмент — проверяется целиком и дословно. */
    private static final Pattern SUMMARY_NUMBER = Pattern.compile(
            "(?<![\\p{L}\\p{N}_])\\d+(?:(?:[ \\u00A0\\u202F]+|[.,:/-])\\d+)*(?![\\p{L}\\p{N}_])");
    private static final Pattern SUMMARY_WORD_DATE = Pattern.compile(
            "(?iu)(?<![\\p{L}\\p{N}_])(\\d{1,2})[\\s\\u00A0\\u202F]+"
                    + "(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)"
                    + "(?:[\\s\\u00A0\\u202F]+(\\d{4}))?(?![\\p{L}\\p{N}_])");
    private static final Pattern UNRESOLVED_PLACEHOLDER = Pattern.compile("<[A-Z]+_\\d+>");
    private static final Pattern NUMBER_SPACES = Pattern.compile("[ \\u00A0\\u202F]+");

    private final TextExtractor textExtractor;
    private final DocumentExtractor documentExtractor;
    private final DocumentClassifier classifier;
    private final TextMinimizer minimizer;
    private final SensitiveDataMasker masker;

    public DocumentExtractionService(
            TextExtractor textExtractor,
            DocumentExtractor documentExtractor,
            DocumentClassifier classifier,
            TextMinimizer minimizer,
            SensitiveDataMasker masker
    ) {
        this.textExtractor = textExtractor;
        this.documentExtractor = documentExtractor;
        this.classifier = classifier;
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
        if (!hasText(extracted.get())) {
            return new DocumentExtractor.ExtractionResult(Map.of(), false, DocumentExtractor.NO_TEXT);
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
            restored.put(spec.fieldName(), new DocumentExtractor.ExtractedField(
                    value, verified.valid() ? verified.quote() : null, verified.valid() ? verified.page() : null));
        }
        // Отдельный вызов модели (#92, ревью капитана к #104): свой системный промпт, свой JSON-ответ — не тот же
        // запрос, что вернул поля. Общий вызов на два разных запроса сдвигал модель к домысливанию дат в полях.
        DocumentExtractor.SummaryResult summaryResult = documentExtractor.summarize(
                new DocumentExtractor.SummaryRequest(masked.text()));
        String summary = summaryResult.available() ? masked.restore(summaryResult.summary()) : null;
        if (!summarySupportedBy(summary, original.fullText())) {
            summary = null;
        }
        return new DocumentExtractor.ExtractionResult(Map.copyOf(restored), true, model.providerId(), summary);
    }

    /**
     * Цитата принимается, только если она есть в тексте документа. Пробелы сравниваются без учёта
     * их вида и числа: модель возвращает перенос строки одним пробелом, и точное сравнение отбрасывало
     * верную цитату (ревью #67). Возвращается фрагмент самого документа, а не пересказ модели.
     */
    private VerifiedQuote verifyQuote(TextExtractor.ExtractedText text, String quote) {
        Optional<Pattern> pattern = quotePattern(quote);
        if (pattern.isEmpty()) {
            return new VerifiedQuote(false, null, null);
        }
        Matcher inFullText = pattern.get().matcher(text.fullText());
        if (!inFullText.find()) {
            return new VerifiedQuote(false, null, null);
        }
        if (!text.paged()) {
            return new VerifiedQuote(true, inFullText.group(), null);
        }
        for (int index = 0; index < text.pages().size(); index++) {
            Matcher onPage = pattern.get().matcher(text.pages().get(index));
            if (onPage.find()) {
                return new VerifiedQuote(true, onPage.group(), index + 1);
            }
        }
        return new VerifiedQuote(false, null, null);
    }

    private static Optional<Pattern> quotePattern(String quote) {
        if (quote == null || quote.isBlank()) {
            return Optional.empty();
        }
        String regex = Pattern.compile(WHITESPACE).splitAsStream(quote.strip())
                .map(Pattern::quote)
                .collect(Collectors.joining(WHITESPACE));
        return Optional.of(Pattern.compile(regex));
    }

    static boolean summarySupportedBy(String summary, String source) {
        if (summary == null || summary.isBlank()) {
            return true;
        }
        if (source == null || UNRESOLVED_PLACEHOLDER.matcher(summary).find()) {
            return false;
        }
        Set<String> sourceNumbers = numericTokens(source);
        for (String number : numericTokens(summary)) {
            if (!sourceNumbers.contains(number)) {
                return false;
            }
        }
        Set<String> sourceWordDates = wordDateTokens(source);
        for (String date : wordDateTokens(summary)) {
            if (!sourceWordDates.contains(date)) {
                return false;
            }
        }
        return true;
    }

    private static Set<String> numericTokens(String text) {
        Set<String> result = new HashSet<>();
        Matcher matcher = SUMMARY_NUMBER.matcher(text);
        while (matcher.find()) {
            result.add(NUMBER_SPACES.matcher(matcher.group()).replaceAll(" "));
        }
        return result;
    }

    private static Set<String> wordDateTokens(String text) {
        Set<String> result = new HashSet<>();
        Matcher matcher = SUMMARY_WORD_DATE.matcher(text);
        while (matcher.find()) {
            result.add(matcher.group(1) + " " + matcher.group(2).toLowerCase(Locale.ROOT)
                    + (matcher.group(3) == null ? "" : " " + matcher.group(3)));
        }
        return result;
    }

    /**
     * Вид документа и короткое название по началу текста (порт {@link DocumentClassifier}).
     * В модель уходит только начало документа и только маскированным — как и при извлечении полей.
     */
    public DocumentClassifier.Classification classify(
            InputStream content,
            String mimeType,
            List<DocumentClassifier.TypeOption> options
    ) {
        Optional<TextExtractor.ExtractedText> extracted = textExtractor.extract(content, mimeType);
        if (extracted.isEmpty() || !hasText(extracted.get())) {
            return new DocumentClassifier.Classification(null, null, false);
        }
        String text = extracted.get().fullText();
        String head = text.length() > CLASSIFICATION_TEXT_LIMIT ? text.substring(0, CLASSIFICATION_TEXT_LIMIT) : text;
        SensitiveDataMasker.MaskedText masked = masker.mask(head);
        DocumentClassifier.Classification result = classifier.classify(
                new DocumentClassifier.ClassificationRequest(masked.text(), options));
        return new DocumentClassifier.Classification(result.typeCode(), masked.restore(result.title()), result.available());
    }

    private static boolean hasText(TextExtractor.ExtractedText text) {
        return text.fullText().codePoints().filter(Character::isLetter).limit(MIN_TEXT_LETTERS).count()
                >= MIN_TEXT_LETTERS;
    }

    private DocumentExtractor.ExtractionResult unavailable() {
        return new DocumentExtractor.ExtractionResult(Map.of(), false, "none");
    }

    private record VerifiedQuote(boolean valid, String quote, Integer page) {}
}
