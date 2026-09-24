package ru.sibvibe.approval.ai.adapter;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.ObjectProvider;
import ru.sibvibe.approval.ai.DocumentExtractor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.anyString;

class GigaChatDocumentExtractorTest {

    private final ObjectProvider<ChatClient.Builder> builders = mock(ObjectProvider.class);
    private final GigaChatDocumentExtractor extractor = new GigaChatDocumentExtractor(
            builders, new ObjectMapper(), false, "gigachat", "", 1);
    private final List<DocumentExtractor.FieldSpec> schema = List.of(
            new DocumentExtractor.FieldSpec("date", DocumentExtractor.FieldType.DATE, "Дата"));

    @AfterEach
    void close() {
        extractor.closeExecutor();
    }

    @Test
    void disabledAiNeverObtainsChatClient() {
        var result = extractor.extract(new DocumentExtractor.ExtractionRequest("text", "TYPE", schema));

        assertThat(result.available()).isFalse();
        verify(builders, never()).getIfAvailable();
    }

    @Test
    void noneProviderNeverObtainsChatClient() {
        var none = new GigaChatDocumentExtractor(
                builders, new ObjectMapper(), true, "none", "secret", 1);
        try {
            var result = none.extract(new DocumentExtractor.ExtractionRequest("text", "TYPE", schema));

            assertThat(result.available()).isFalse();
            verify(builders, never()).getIfAvailable();
        } finally {
            none.closeExecutor();
        }
    }

    @Test
    void missingCredentialsNeverObtainsChatClient() {
        var withoutKey = new GigaChatDocumentExtractor(
                builders, new ObjectMapper(), true, "gigachat", " ", 1);
        try {
            var result = withoutKey.extract(new DocumentExtractor.ExtractionRequest("text", "TYPE", schema));

            assertThat(result.available()).isFalse();
            verify(builders, never()).getIfAvailable();
        } finally {
            withoutKey.closeExecutor();
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void timeoutReturnsUnavailableInsteadOfEscaping() throws Exception {
        ObjectProvider<ChatClient.Builder> provider = mock(ObjectProvider.class);
        ChatClient.Builder builder = mock(ChatClient.Builder.class, RETURNS_DEEP_STUBS);
        when(provider.getIfAvailable()).thenReturn(builder);
        when(builder.build().prompt().system(anyString()).user(anyString()).call().content())
                .thenAnswer(invocation -> {
                    Thread.sleep(5_000);
                    return "{}";
                });
        var timed = new GigaChatDocumentExtractor(
                provider, new ObjectMapper(), true, "gigachat", "secret", 1);
        try {
            var result = timed.extract(new DocumentExtractor.ExtractionRequest("text", "TYPE", schema));

            assertThat(result.available()).isFalse();
        } finally {
            timed.closeExecutor();
        }
    }

    /** Живой прогон 24.09: случайный некорректный JSON — один повтор, а не потеря всех полей. */
    @Test
    @SuppressWarnings("unchecked")
    void invalidJsonIsRetriedOnceAndThenGivesUp() {
        ObjectProvider<ChatClient.Builder> provider = mock(ObjectProvider.class);
        ChatClient.Builder builder = mock(ChatClient.Builder.class, RETURNS_DEEP_STUBS);
        when(provider.getIfAvailable()).thenReturn(builder);
        when(builder.build().prompt().system(anyString()).user(anyString()).call().content())
                .thenReturn("{\"fields\":[{\"fieldName\":\"date\",\"value\":\"ООО \"Ромашка\"\"}]}")
                .thenReturn("{\"fields\":[{\"fieldName\":\"date\",\"value\":\"01.10.2026\"}]}");
        var retried = new GigaChatDocumentExtractor(provider, new ObjectMapper(), true, "gigachat", "secret", 5);
        try {
            var result = retried.extract(new DocumentExtractor.ExtractionRequest("text", "TYPE", schema));

            assertThat(result.available()).isTrue();
            assertThat(result.fields().get("date").value()).isEqualTo("01.10.2026");
        } finally {
            retried.closeExecutor();
        }

        when(builder.build().prompt().system(anyString()).user(anyString()).call().content()).thenReturn("не JSON");
        var failing = new GigaChatDocumentExtractor(provider, new ObjectMapper(), true, "gigachat", "secret", 5);
        try {
            assertThat(failing.extract(new DocumentExtractor.ExtractionRequest("text", "TYPE", schema)).available())
                    .as("после второй неудачи — «модель недоступна», без бесконечных повторов").isFalse();
        } finally {
            failing.closeExecutor();
        }
    }

    @Test
    void acceptsMarkdownUnknownAndMissingFieldsButRejectsInvalidKnownValues() {
        var enabled = new GigaChatDocumentExtractor(
                builders, new ObjectMapper(), true, "gigachat", "secret", 1);
        try {
            var valid = enabled.parse(
                    "{\"summary\":\"Отпуск начинается 22.09.2026.\",\"fields\":[{\"fieldName\":\"date\",\"value\":\"2026-09-22\",\"quote\":\"22.09.2026\",\"page\":1}]}",
                    schema);
            var unknown = enabled.parse(
                    "{\"fields\":[{\"fieldName\":\"unknown\",\"value\":42}],\"extra\":true}",
                    schema);
            var markdown = enabled.parse("```json\n{\"fields\":[]}\n```", schema);
            var invalid = enabled.parse(
                    "{\"fields\":[{\"fieldName\":\"date\",\"value\":42}]}", schema);
            var duplicate = enabled.parse(
                    "{\"fields\":[{\"fieldName\":\"date\",\"value\":null},"
                            + "{\"fieldName\":\"date\",\"value\":null}]}", schema);
            var summaryArray = enabled.parse(
                    "{\"summary\":[\"а\",\"б\"],\"fields\":[{\"fieldName\":\"date\","
                            + "\"value\":\"2026-09-22\",\"quote\":null,\"page\":null}]}", schema);
            var summaryTooLong = enabled.parse(
                    "{\"summary\":\"" + "x".repeat(2_001) + "\",\"fields\":[{\"fieldName\":\"date\","
                            + "\"value\":\"2026-09-22\",\"quote\":null,\"page\":null}]}", schema);

            assertThat(valid.available()).isTrue();
            assertThat(valid.summary()).isEqualTo("Отпуск начинается 22.09.2026.");
            assertThat(valid.fields()).containsKey("date");
            assertThat(unknown.available()).isTrue();
            assertThat(unknown.fields().get("date").value()).isNull();
            assertThat(markdown.available()).isTrue();
            assertThat(markdown.fields().get("date").value()).isNull();
            assertThat(invalid.available()).isFalse();
            assertThat(duplicate.available()).isFalse();
            assertThat(summaryArray.available()).isTrue();
            assertThat(summaryArray.fields().get("date").value()).isEqualTo("2026-09-22");
            assertThat(summaryArray.summary()).isNull();
            assertThat(summaryTooLong.available()).isTrue();
            assertThat(summaryTooLong.fields().get("date").value()).isEqualTo("2026-09-22");
            assertThat(summaryTooLong.summary()).isNull();
        } finally {
            enabled.closeExecutor();
        }
    }
}
