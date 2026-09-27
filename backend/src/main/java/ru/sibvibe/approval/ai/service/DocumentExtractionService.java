package ru.sibvibe.approval.ai.service;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import ru.sibvibe.approval.ai.DocumentClassifier;
import ru.sibvibe.approval.ai.DocumentExtractor;
import ru.sibvibe.approval.ai.TextExtractor;

import java.io.InputStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
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
    /** Дата после числа дня по-русски всегда родительный падеж («15 января»), поэтому здесь — только он. */
    private static final String MONTH_NAMES =
            "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря";
    private static final Pattern SUMMARY_WORD_DATE = Pattern.compile(
            "(?iu)(?<![\\p{L}\\p{N}_])(\\d{1,2})[\\s\\u00A0\\u202F]+(" + MONTH_NAMES + ")"
                    + "(?:[\\s\\u00A0\\u202F]+(\\d{4}))?(?![\\p{L}\\p{N}_])");
    /**
     * Отдельно от даты целиком: неверный месяц должен отбрасывать сводку, даже без числа дня рядом («в декабре»).
     * Без числа дня месяц чаще стоит не в родительном падеже («в декабре», не «в декабря»), поэтому сравниваются
     * основы слов, а не целые формы: «декабр» из «декабре», «декабря» и «декабрь» — один и тот же токен.
     */
    private static final String MONTH_STEMS =
            "январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр";
    private static final Pattern SUMMARY_MONTH_WORD = Pattern.compile(
            "(?iu)(?<![\\p{L}])(" + MONTH_STEMS + ")\\p{L}*(?![\\p{L}])");
    private static final Pattern UNRESOLVED_PLACEHOLDER = Pattern.compile("<[A-Z]+_\\d+>");
    private static final Pattern NUMBER_SPACES = Pattern.compile("[ \\u00A0\\u202F]+");

    private final TextExtractor textExtractor;
    private final DocumentExtractor documentExtractor;
    private final DocumentClassifier classifier;
    private final TextMinimizer minimizer;
    private final SensitiveDataMasker masker;
    private final Duration timeout;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public DocumentExtractionService(
            TextExtractor textExtractor,
            DocumentExtractor documentExtractor,
            DocumentClassifier classifier,
            TextMinimizer minimizer,
            SensitiveDataMasker masker,
            @Value("${app.ai.timeout-seconds:30}") long timeoutSeconds
    ) {
        this.textExtractor = textExtractor;
        this.documentExtractor = documentExtractor;
        this.classifier = classifier;
        this.minimizer = minimizer;
        this.masker = masker;
        this.timeout = Duration.ofSeconds(Math.max(1, timeoutSeconds));
    }

    /**
     * @param fields  поля и статус модели — как раньше
     * @param summary проверенная краткая сводка (#92); {@code null} — документ чувствительный (решает вызывающий
     *                код), файл без текста, модель недоступна для полей или для сводки, либо сводка не прошла
     *                проверку фактов
     */
    public record ExtractionOutcome(DocumentExtractor.ExtractionResult fields, String summary) {}

    public ExtractionOutcome extract(
            InputStream content,
            String mimeType,
            String documentTypeCode,
            List<DocumentExtractor.FieldSpec> schema
    ) {
        Optional<TextExtractor.ExtractedText> extracted = textExtractor.extract(content, mimeType);
        if (extracted.isEmpty()) {
            return new ExtractionOutcome(unavailable(), null);
        }
        if (!hasText(extracted.get())) {
            return new ExtractionOutcome(
                    new DocumentExtractor.ExtractionResult(Map.of(), false, DocumentExtractor.NO_TEXT), null);
        }
        TextExtractor.ExtractedText original = extracted.get();
        String minimized = minimizer.minimize(original.fullText(), schema);
        SensitiveDataMasker.MaskedText masked = masker.mask(minimized);

        // Оба вызова идут параллельно, не один за другим (ревью Mat10t к #104, п.1): сводка зависит только от
        // текста, а не от результата полей, и ждать её после — значит платить суммой двух тайм-аутов вместо одного.
        long deadline = System.nanoTime() + timeout.toNanos();
        Future<DocumentExtractor.ExtractionResult> fieldsFuture = executor.submit(() -> documentExtractor.extract(
                new DocumentExtractor.ExtractionRequest(masked.text(), documentTypeCode, schema)));
        Future<DocumentExtractor.SummaryResult> summaryFuture = executor.submit(
                () -> documentExtractor.summarize(new DocumentExtractor.SummaryRequest(masked.text())));

        DocumentExtractor.ExtractionResult model = awaitFields(fieldsFuture, deadline);
        if (!model.available()) {
            summaryFuture.cancel(true);
            return new ExtractionOutcome(model, null);
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

        // Сводку не ждём дольше, чем осталось до дедлайна полей — та же бюджетная граница, а не отдельные
        // 30 секунд поверх уже потраченного времени.
        DocumentExtractor.SummaryResult summaryResult = awaitSummary(summaryFuture, deadline);
        String summary = summaryResult.available() ? masked.restore(summaryResult.summary()) : null;
        if (!summarySupportedBy(summary, original.fullText())) {
            summary = null;
        }
        return new ExtractionOutcome(
                new DocumentExtractor.ExtractionResult(Map.copyOf(restored), true, model.providerId()), summary);
    }

    private DocumentExtractor.ExtractionResult awaitFields(
            Future<DocumentExtractor.ExtractionResult> future, long deadline
    ) {
        try {
            return future.get(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
        } catch (TimeoutException exception) {
            future.cancel(true);
            return unavailable();
        } catch (InterruptedException exception) {
            future.cancel(true);
            Thread.currentThread().interrupt();
            return unavailable();
        } catch (ExecutionException exception) {
            return unavailable();
        }
    }

    /** Сводка «висит» или падает — поля это не задерживает и не роняет: их результат уже получен выше. */
    private DocumentExtractor.SummaryResult awaitSummary(
            Future<DocumentExtractor.SummaryResult> future, long deadline
    ) {
        long left = deadline - System.nanoTime();
        if (left <= 0) {
            future.cancel(true);
            return new DocumentExtractor.SummaryResult(null, false);
        }
        try {
            return future.get(left, TimeUnit.NANOSECONDS);
        } catch (TimeoutException exception) {
            future.cancel(true);
            return new DocumentExtractor.SummaryResult(null, false);
        } catch (InterruptedException exception) {
            future.cancel(true);
            Thread.currentThread().interrupt();
            return new DocumentExtractor.SummaryResult(null, false);
        } catch (ExecutionException exception) {
            return new DocumentExtractor.SummaryResult(null, false);
        }
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

    /**
     * Сводка принимается, только если каждое число, записанное цифрами, и каждая дата с месяцем словом в ней
     * дословно (для чисел) или по дню и месяцу (для дат) находятся в исходном тексте. Год у даты сверяется,
     * только если сводка его указала (ревью Mat10t к #104, п.6): дата без года — не то же самое, что дата
     * с неверным годом, и не должна отбрасываться зря. Слова-числа («пятьсот тысяч») эта проверка не ловит —
     * такого от неё не требуется (см. README §12, API_CONTRACTS.md): модель просят писать числа цифрами,
     * а не отгадывать их прописью в коде.
     */
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
        Set<String> sourceMonthWords = monthWords(source);
        for (String month : monthWords(summary)) {
            if (!sourceMonthWords.contains(month)) {
                return false;
            }
        }
        List<DateToken> sourceDates = dateTokens(source);
        for (DateToken date : dateTokens(summary)) {
            boolean found = sourceDates.stream().anyMatch(date::matchesIgnoringAbsentYear);
            if (!found) {
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

    private static Set<String> monthWords(String text) {
        Set<String> result = new HashSet<>();
        Matcher matcher = SUMMARY_MONTH_WORD.matcher(text);
        while (matcher.find()) {
            result.add(matcher.group(1).toLowerCase(Locale.ROOT));
        }
        return result;
    }

    private static List<DateToken> dateTokens(String text) {
        List<DateToken> result = new ArrayList<>();
        Matcher matcher = SUMMARY_WORD_DATE.matcher(text);
        while (matcher.find()) {
            result.add(new DateToken(matcher.group(1), matcher.group(2).toLowerCase(Locale.ROOT), matcher.group(3)));
        }
        return result;
    }

    /** @param year {@code null}, если дата в тексте без года. */
    private record DateToken(String day, String month, String year) {
        /** Год сверяется, только если он указан в этом токене — иначе дата без года отбрасывалась бы зря. */
        boolean matchesIgnoringAbsentYear(DateToken sourceToken) {
            return day.equals(sourceToken.day) && month.equals(sourceToken.month)
                    && (year == null || year.equals(sourceToken.year));
        }
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

    @PreDestroy
    void closeExecutor() {
        executor.shutdownNow();
    }

    private record VerifiedQuote(boolean valid, String quote, Integer page) {}
}
