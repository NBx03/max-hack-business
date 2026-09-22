package ru.sibvibe.approval.document.service;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import ru.sibvibe.approval.ai.DocumentExtractor;
import ru.sibvibe.approval.document.dto.DocumentCardResponse;
import ru.sibvibe.approval.document.entity.DocumentType;
import ru.sibvibe.approval.document.entity.DocumentTypeField;
import ru.sibvibe.approval.document.repository.DocumentTypeFieldRepository;
import ru.sibvibe.approval.document.repository.DocumentTypeRepository;
import ru.sibvibe.approval.rules.RuleEngine;
import ru.sibvibe.approval.rules.repository.RequirementRuleRepository;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DocumentRuleServiceTest {

    @Test
    void passesExplicitMoscowBusinessDateAndManualValuesToRuleEngine() {
        RuleEngine engine = mock(RuleEngine.class);
        var service = new DocumentRuleService(
                mock(DocumentTypeRepository.class),
                mock(DocumentTypeFieldRepository.class),
                mock(RequirementRuleRepository.class),
                engine,
                Clock.fixed(Instant.parse("2026-09-20T21:30:00Z"), ZoneOffset.UTC));
        DocumentType type = new DocumentType();
        type.setId(1L);
        type.setCode("ORDER");
        DocumentTypeField field = new DocumentTypeField();
        field.setFieldName("date");
        var rule = new RuleEngine.RequirementRule(
                2L, "ORDER", "date", "Дата не из будущего",
                RuleEngine.CheckType.DATE_NOT_FUTURE, null,
                RuleEngine.RuleKind.PRODUCT_RULE, RuleEngine.Severity.BLOCKER,
                "Правила продукта", null, null, Instant.parse("2026-09-01T00:00:00Z"));
        var prepared = new DocumentRuleService.PreparedCheck(
                type, List.of(field), Map.of("date", "2026-09-21"), List.of(rule));
        when(engine.validate(any(), any(), any())).thenReturn(List.of());

        DocumentRuleService.CheckData result = service.execute(prepared);

        ArgumentCaptor<RuleEngine.ValidationContext> context =
                ArgumentCaptor.forClass(RuleEngine.ValidationContext.class);
        verify(engine).validate(any(), any(), context.capture());
        assertThat(context.getValue().referenceDate()).isEqualTo(LocalDate.of(2026, 9, 21));
        assertThat(result.modelAvailable()).isFalse();
        assertThat(result.fields()).singleElement().satisfies(value -> {
            assertThat(value.name()).isEqualTo("date");
            assertThat(value.value()).isEqualTo("2026-09-21");
            assertThat(value.source()).isEqualTo("MANUAL");
        });
    }

    @Test
    void mergesModelFieldsWithManualOverridesAndPassesVerifiedLocations() {
        RuleEngine engine = mock(RuleEngine.class);
        var service = new DocumentRuleService(
                mock(DocumentTypeRepository.class),
                mock(DocumentTypeFieldRepository.class),
                mock(RequirementRuleRepository.class),
                engine,
                Clock.fixed(Instant.parse("2026-09-22T00:00:00Z"), ZoneOffset.UTC));
        DocumentType type = new DocumentType();
        type.setCode("MEMO");
        DocumentTypeField date = new DocumentTypeField();
        date.setFieldName("date");
        DocumentTypeField author = new DocumentTypeField();
        author.setFieldName("author");
        var prepared = new DocumentRuleService.PreparedCheck(
                type, List.of(date, author), Map.of("author", "Введено вручную"), List.of());
        var extraction = new DocumentExtractor.ExtractionResult(Map.of(
                "date", new DocumentExtractor.ExtractedField("2026-09-22", "Дата: 22.09.2026", 2),
                "author", new DocumentExtractor.ExtractedField("Из модели", "Автор", 1)),
                true, "gigachat");
        when(engine.validate(any(), any(), any())).thenReturn(List.of());

        var result = service.execute(prepared, extraction);

        ArgumentCaptor<Map<String, String>> values = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<RuleEngine.ValidationContext> context =
                ArgumentCaptor.forClass(RuleEngine.ValidationContext.class);
        verify(engine).validate(values.capture(), any(), context.capture());
        assertThat(values.getValue()).containsEntry("date", "2026-09-22")
                .containsEntry("author", "Введено вручную");
        assertThat(context.getValue().locations()).containsEntry(
                "date", new RuleEngine.FieldLocation("Дата: 22.09.2026", 2));
        assertThat(context.getValue().locations()).doesNotContainKey("author");
        assertThat(result.modelAvailable()).isTrue();
        assertThat(result.fields()).extracting(DocumentCardResponse.FieldValue::source)
                .containsExactly("MODEL", "MANUAL");
    }

    @Test
    void manualUpdatePreservesUnchangedModelFieldAndMarksChangedFieldManual() {
        RuleEngine engine = mock(RuleEngine.class);
        var service = new DocumentRuleService(
                mock(DocumentTypeRepository.class), mock(DocumentTypeFieldRepository.class),
                mock(RequirementRuleRepository.class), engine,
                Clock.fixed(Instant.parse("2026-09-22T00:00:00Z"), ZoneOffset.UTC));
        DocumentType type = new DocumentType();
        type.setCode("MEMO");
        DocumentTypeField date = new DocumentTypeField();
        date.setFieldName("date");
        DocumentTypeField author = new DocumentTypeField();
        author.setFieldName("author");
        var prepared = new DocumentRuleService.PreparedCheck(
                type, List.of(date, author), Map.of("date", "2026-09-22", "author", "Исправлено"), List.of());
        var previous = new DocumentRuleService.CheckData(true, List.of(
                new DocumentCardResponse.FieldValue("date", "2026-09-22", "MODEL", "22.09.2026", 2),
                new DocumentCardResponse.FieldValue("author", "Из модели", "MODEL", "Автор", 1)), List.of());
        when(engine.validate(any(), any(), any())).thenReturn(List.of());

        var result = service.executeManualUpdate(prepared, previous);

        assertThat(result.modelAvailable()).isTrue();
        assertThat(result.fields()).containsExactly(
                new DocumentCardResponse.FieldValue("date", "2026-09-22", "MODEL", "22.09.2026", 2),
                new DocumentCardResponse.FieldValue("author", "Исправлено", "MANUAL", null, null));
    }
}
