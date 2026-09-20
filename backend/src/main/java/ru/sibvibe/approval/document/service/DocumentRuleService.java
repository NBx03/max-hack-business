package ru.sibvibe.approval.document.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.common.api.NotFoundException;
import ru.sibvibe.approval.document.dto.DocumentCardResponse;
import ru.sibvibe.approval.document.entity.DocumentType;
import ru.sibvibe.approval.document.entity.DocumentTypeField;
import ru.sibvibe.approval.document.repository.DocumentTypeFieldRepository;
import ru.sibvibe.approval.document.repository.DocumentTypeRepository;
import ru.sibvibe.approval.rules.RuleEngine;
import ru.sibvibe.approval.rules.repository.RequirementRuleRepository;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class DocumentRuleService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Moscow");

    private final DocumentTypeRepository typeRepository;
    private final DocumentTypeFieldRepository fieldRepository;
    private final RequirementRuleRepository ruleRepository;
    private final RuleEngine ruleEngine;
    private final Clock clock;

    public DocumentRuleService(
            DocumentTypeRepository typeRepository,
            DocumentTypeFieldRepository fieldRepository,
            RequirementRuleRepository ruleRepository,
            RuleEngine ruleEngine,
            Clock clock
    ) {
        this.typeRepository = typeRepository;
        this.fieldRepository = fieldRepository;
        this.ruleRepository = ruleRepository;
        this.ruleEngine = ruleEngine;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PreparedCheck prepare(long documentTypeId, Map<String, String> suppliedFields) {
        DocumentType type = typeRepository.findById(documentTypeId).orElseThrow(NotFoundException::new);
        List<DocumentTypeField> schema = fieldRepository.findByDocumentTypeIdOrderById(documentTypeId);
        Map<String, String> fields = suppliedFields == null
                ? Map.of()
                : new LinkedHashMap<>(suppliedFields);
        Set<String> knownNames = schema.stream()
                .map(DocumentTypeField::getFieldName)
                .collect(Collectors.toSet());
        if (fields.keySet().stream().anyMatch(name -> name == null || !knownNames.contains(name))) {
            throw DocumentApiException.validation("Переданы неизвестные поля документа");
        }
        List<RuleEngine.RequirementRule> rules = ruleRepository
                .findByDocumentTypeIdOrderById(documentTypeId).stream()
                .map(rule -> new RuleEngine.RequirementRule(
                        rule.getId(),
                        type.getCode(),
                        rule.getFieldName(),
                        rule.getDescription(),
                        rule.getCheckType(),
                        rule.getExpected(),
                        rule.getKind(),
                        rule.getSeverity(),
                        rule.getSourceTitle(),
                        rule.getSourceUrl(),
                        rule.getSourceRef(),
                        rule.getSourceCheckedAt()))
                .toList();
        return new PreparedCheck(
                type,
                List.copyOf(schema),
                Collections.unmodifiableMap(new LinkedHashMap<>(fields)),
                rules);
    }

    public CheckData execute(PreparedCheck prepared) {
        if (prepared.type().isGeneric()) {
            return null;
        }
        List<DocumentCardResponse.FieldValue> fields = manualFields(prepared);
        List<DocumentCardResponse.ValidationIssueView> issues = ruleEngine.validate(
                        prepared.suppliedFields(),
                        prepared.rules(),
                        new RuleEngine.ValidationContext(
                                LocalDate.ofInstant(clock.instant(), BUSINESS_ZONE), Map.of()))
                .stream()
                .map(issue -> new DocumentCardResponse.ValidationIssueView(
                        issue.ruleId(),
                        issue.fieldName(),
                        issue.message(),
                        issue.severity(),
                        issue.kind(),
                        issue.sourceTitle(),
                        issue.sourceUrl(),
                        issue.sourceRef(),
                        issue.quote(),
                        issue.page()))
                .toList();
        return new CheckData(false, fields, issues);
    }

    public CheckData pending(PreparedCheck prepared) {
        if (prepared.type().isGeneric()) {
            return null;
        }
        return new CheckData(false, manualFields(prepared), List.of());
    }

    private List<DocumentCardResponse.FieldValue> manualFields(PreparedCheck prepared) {
        return prepared.schema().stream()
                .map(field -> new DocumentCardResponse.FieldValue(
                        field.getFieldName(),
                        prepared.suppliedFields().get(field.getFieldName()),
                        "MANUAL",
                        null,
                        null))
                .toList();
    }

    public record PreparedCheck(
            DocumentType type,
            List<DocumentTypeField> schema,
            Map<String, String> suppliedFields,
            List<RuleEngine.RequirementRule> rules
    ) {}

    public record CheckData(
            boolean modelAvailable,
            List<DocumentCardResponse.FieldValue> fields,
            List<DocumentCardResponse.ValidationIssueView> issues
    ) {}
}
