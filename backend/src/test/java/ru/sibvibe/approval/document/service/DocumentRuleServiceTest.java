package ru.sibvibe.approval.document.service;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
}
