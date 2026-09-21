package ru.sibvibe.approval.rules;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import ru.sibvibe.approval.rules.RuleEngine.CheckType;
import ru.sibvibe.approval.rules.RuleEngine.RequirementRule;
import ru.sibvibe.approval.rules.RuleEngine.RuleKind;
import ru.sibvibe.approval.rules.RuleEngine.Severity;
import ru.sibvibe.approval.rules.RuleEngine.ValidationContext;
import ru.sibvibe.approval.rules.RuleEngine.ValidationIssue;
import ru.sibvibe.approval.rules.service.DefaultRuleEngine;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Настоящий движок правил на данных из testdata/: правила из rules.json, поля и ожидаемые
 * замечания из expected.json. Ловит расхождение между данными для #11 и кодом движка.
 */
class TestdataRulesTest {

    private static final Path TESTDATA = Path.of("..", "testdata");
    private static final Set<String> FIELD_TYPES = Set.of("STRING", "DATE", "NUMBER", "PERSON", "ORGANIZATION");

    private final ObjectMapper mapper = new ObjectMapper();
    private final RuleEngine engine = new DefaultRuleEngine(Clock.system(ZoneOffset.UTC), mapper);

    @TestFactory
    Stream<DynamicTest> documentsProduceExpectedIssues() throws IOException {
        JsonNode rules = read("rules.json");
        JsonNode expected = read("expected.json");
        LocalDate referenceDate = LocalDate.parse(expected.get("referenceDate").asText());
        Map<String, TypeRules> byType = typeRules(rules);

        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode document : expected.get("documents")) {
            String file = document.get("file").asText();
            tests.add(DynamicTest.dynamicTest(file, () -> {
                TypeRules type = byType.get(document.get("type").asText());
                assertThat(type).as("тип документа %s описан в rules.json", file).isNotNull();
                assertThat(Files.exists(TESTDATA.resolve(file))).as("файл %s существует", file).isTrue();

                Map<String, String> fields = new HashMap<>();
                document.get("fields").fields().forEachRemaining(e -> fields.put(e.getKey(), e.getValue().asText()));
                assertThat(type.fieldNames()).as("поля %s описаны в rules.json", file).containsAll(fields.keySet());

                List<ValidationIssue> issues = engine.validate(fields, type.rules(),
                        new ValidationContext(referenceDate, Map.of()));
                List<String> codes = issues.stream().map(issue -> type.codeById().get(issue.ruleId())).toList();
                List<String> want = new ArrayList<>();
                document.get("issues").forEach(code -> want.add(code.asText()));
                assertThat(codes).as("замечания для %s", file).isEqualTo(want);
            }));
        }
        return tests.stream();
    }

    @Test
    void rulesFitDatabaseConstraints() throws IOException {
        for (JsonNode type : read("rules.json").get("types")) {
            Set<String> names = new java.util.HashSet<>();
            for (JsonNode field : type.get("fields")) {
                assertThat(FIELD_TYPES).contains(field.get("type").asText());
                assertThat(names.add(field.get("name").asText())).as("имя поля уникально в типе").isTrue();
            }
            for (JsonNode rule : type.get("rules")) {
                // requirement_rule ссылается на document_type_field по (тип, поле).
                assertThat(names).contains(rule.get("field").asText());
            }
        }
    }

    private Map<String, TypeRules> typeRules(JsonNode root) {
        JsonNode sources = root.get("sources");
        java.time.Instant checkedAt = LocalDate.parse(root.get("sourceCheckedAt").asText())
                .atStartOfDay(ZoneOffset.UTC).toInstant();
        Map<String, TypeRules> result = new HashMap<>();
        long id = 1;
        for (JsonNode type : root.get("types")) {
            String typeCode = type.get("code").asText();
            List<RequirementRule> list = new ArrayList<>();
            Map<Long, String> codeById = new LinkedHashMap<>();
            for (JsonNode rule : type.get("rules")) {
                JsonNode source = sources.get(rule.get("source").asText());
                list.add(new RequirementRule(id, typeCode, rule.get("field").asText(),
                        rule.get("description").asText(), CheckType.valueOf(rule.get("check").asText()),
                        text(rule, "expected"), RuleKind.valueOf(rule.get("kind").asText()),
                        Severity.valueOf(rule.get("severity").asText()), source.get("title").asText(),
                        text(source, "url"), text(rule, "sourceRef"), checkedAt));
                codeById.put(id++, rule.get("code").asText());
            }
            Set<String> fieldNames = new java.util.HashSet<>();
            type.get("fields").forEach(field -> fieldNames.add(field.get("name").asText()));
            result.put(typeCode, new TypeRules(List.copyOf(list), codeById, fieldNames));
        }
        return result;
    }

    private static String text(JsonNode node, String name) {
        JsonNode value = node.get(name);
        return value == null || value.isNull() ? null : value.asText();
    }

    private JsonNode read(String name) throws IOException {
        return mapper.readTree(TESTDATA.resolve(name).toFile());
    }

    private record TypeRules(List<RequirementRule> rules, Map<Long, String> codeById, Set<String> fieldNames) {}
}
