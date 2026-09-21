package ru.sibvibe.approval.approval;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import ru.sibvibe.approval.storage.FileStorage;
import ru.sibvibe.approval.storage.StoredFileNotFoundException;

import javax.sql.DataSource;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * Движок маршрутов и состояния документа на настоящем PostgreSQL (задача #5). Тест идёт по реальным API от
 * создания документа (#16) до статуса «Согласован», в собственной схеме {@value #SCHEMA} со свежими миграциями:
 * типы документов и маршруты по умолчанию здесь такие, какими их создают миграция и создание компании.
 *
 * <p>Гонки проверяются детерминированно: отдельная транзакция удерживает блокировку строки документа, обе
 * операции встают в очередь, затем блокировка снимается. Запускается только при заданных
 * {@code SCHEMA_TEST_URL} и {@code SCHEMA_TEST_PASSWORD} (backend/src/test/README.md).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@EnabledIfEnvironmentVariable(named = "SCHEMA_TEST_URL", matches = ".+")
class ApprovalIntegrationTest {

    private static final String SCHEMA = "approval_it";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final AtomicLong MAX_IDS = new AtomicLong(940_000_000L);

    static {
        String url = System.getenv("SCHEMA_TEST_URL");
        if (url != null && !url.isBlank()) {
            try (Connection connection = DriverManager.getConnection(
                    url, "schema_test", System.getenv("SCHEMA_TEST_PASSWORD"));
                 Statement statement = connection.createStatement()) {
                statement.execute("drop schema if exists " + SCHEMA + " cascade");
                statement.execute("create schema " + SCHEMA);
            } catch (SQLException exception) {
                throw new ExceptionInInitializerError(exception);
            }
        }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> {
            String url = System.getenv("SCHEMA_TEST_URL");
            return url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA;
        });
        registry.add("spring.datasource.username", () -> "schema_test");
        registry.add("spring.datasource.password", () -> System.getenv("SCHEMA_TEST_PASSWORD"));
        registry.add("app.demo-mode", () -> "true");
        registry.add("app.download.secret", () -> "approval-integration-test-secret-32-bytes");
        registry.add("max.bot.token", () -> "approval-test-token");
        registry.add("minio.endpoint", () -> "http://127.0.0.1:9000");
        registry.add("minio.access-key", () -> "test-access-key");
        registry.add("minio.secret-key", () -> "test-secret-key");
        registry.add("spring.autoconfigure.exclude",
                () -> "chat.giga.springai.autoconfigure.GigaChatAutoConfiguration");
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private InMemoryFileStorage storage;

    private Company company;

    @BeforeEach
    void setUp() throws Exception {
        cleanDatabase();
        company = newCompany("Ромашка");
    }

    @AfterEach
    void cleanDatabase() {
        for (String table : List.of("approval_step", "document_file", "document_version", "document",
                "approval_route", "invite_role", "join_request", "invite", "member_role", "organization_member",
                "role", "organization", "app_user")) {
            jdbc.update("delete from " + table);
        }
        storage.clear();
    }

    // ============ предпросмотр ============

    @Test
    void previewShowsHowEveryParticipantIsResolved() throws Exception {
        long memo = createDocument(company.frank, "OFFICIAL_MEMO");
        JsonNode memoPreview = ok(call(company.frank, "GET", "/api/v1/documents/" + memo + "/route-preview", null));
        assertThat(memoPreview.path("problems")).isEmpty();
        JsonNode head = memoPreview.path("stages").get(0).path("participants").get(0);
        assertThat(head.path("role").path("code").asText()).isEqualTo("DEPARTMENT_HEAD");
        assertThat(head.path("resolution").asText()).isEqualTo("AUTO");
        assertThat(head.path("selectedUserId").asLong()).isEqualTo(company.bob.dbId);
        assertThat(head.path("mandatory").asBoolean()).isFalse();
        JsonNode director = memoPreview.path("stages").get(1).path("participants").get(0);
        assertThat(director.path("resolution").asText()).isEqualTo("AUTO");
        assertThat(director.path("selectedUserId").asLong()).isEqualTo(company.alice.dbId);

        long support = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");
        JsonNode supportPreview = ok(call(company.frank, "GET", "/api/v1/documents/" + support + "/route-preview", null));
        JsonNode parallel = supportPreview.path("stages").get(0).path("participants");
        assertThat(parallel).hasSize(2);
        assertThat(parallel.get(0).path("role").path("code").asText()).isEqualTo("LAWYER");
        assertThat(parallel.get(0).path("resolution").asText()).isEqualTo("SELECT");
        assertThat(parallel.get(0).path("candidates")).hasSize(2);
        assertThat(parallel.get(0).path("selectedUserId").isNull()).isTrue();
        assertThat(parallel.get(1).path("resolution").asText()).isEqualTo("AUTO");

        // автор — единственный директор: обязательный шаг согласован им автоматически
        long vacation = createDocument(company.alice, "VACATION_REQUEST");
        JsonNode selfPreview = ok(call(company.alice, "GET", "/api/v1/documents/" + vacation + "/route-preview", null));
        assertThat(selfPreview.path("stages").get(1).path("participants").get(0).path("resolution").asText())
                .isEqualTo("AUTHOR_HOLDS_ROLE");
        assertThat(selfPreview.path("problems")).isEmpty();

        // автор — единственный руководитель отдела: необязательный участник пропускается
        long bobMemo = createDocument(company.bob, "OFFICIAL_MEMO");
        JsonNode skipped = ok(call(company.bob, "GET", "/api/v1/documents/" + bobMemo + "/route-preview", null));
        assertThat(skipped.path("stages").get(0).path("participants").get(0).path("resolution").asText())
                .isEqualTo("SKIPPED");
    }

    @Test
    void mandatoryRoleWithNoHolderIsReportedByPreviewAndBlocksSubmission() throws Exception {
        jdbc.update("delete from member_role where role_id = (select id from role where code = 'DIRECTOR')");
        long memo = createDocument(company.frank, "OFFICIAL_MEMO");

        JsonNode preview = ok(call(company.frank, "GET", "/api/v1/documents/" + memo + "/route-preview", null));
        assertThat(preview.path("problems")).hasSize(1);
        assertThat(preview.path("problems").get(0).path("code").asText()).isEqualTo("ROUTE_ROLE_EMPTY");
        assertThat(preview.path("problems").get(0).path("message").asText())
                .isEqualTo("В компании нет сотрудника с ролью «Директор»");

        Resp submit = call(company.frank, "POST", "/api/v1/documents/" + memo + "/submit", null);
        assertThat(submit.status()).isEqualTo(409);
        assertThat(submit.code()).isEqualTo("ROUTE_ROLE_EMPTY");
        assertThat(submit.json().path("details").path("role").asText()).isEqualTo("Директор");
        assertThat(status(memo)).isEqualTo("DRAFT");
        assertThat(count("approval_step")).isZero();
    }

    @Test
    void blockingIssuesAndFailedChecksStopSubmissionAndAreShownInPreview() throws Exception {
        long memo = createDocument(company.frank, "OFFICIAL_MEMO");
        jdbc.update("update document_version set check_status = 'CHECKED', validation_issues = "
                + "'[{\"severity\":\"BLOCKER\",\"ruleId\":1}]'::jsonb where document_id = ?", memo);

        JsonNode preview = ok(call(company.frank, "GET", "/api/v1/documents/" + memo + "/route-preview", null));
        assertThat(preview.path("problems")).extracting(node -> node.path("code").asText())
                .containsExactly("BLOCKING_ISSUES");
        assertThat(card(company.frank, memo).path("permissions").path("canSubmit").asBoolean()).isFalse();
        Resp blocked = call(company.frank, "POST", "/api/v1/documents/" + memo + "/submit", null);
        assertThat(blocked.status()).isEqualTo(409);
        assertThat(blocked.code()).isEqualTo("BLOCKING_ISSUES");

        jdbc.update("update document_version set check_status = 'FAILED', validation_issues = '[]'::jsonb"
                + " where document_id = ?", memo);
        assertThat(call(company.frank, "POST", "/api/v1/documents/" + memo + "/submit", null).code())
                .isEqualTo("BLOCKING_ISSUES");

        jdbc.update("update document_version set check_status = 'CHECKED' where document_id = ?", memo);
        assertThat(call(company.frank, "POST", "/api/v1/documents/" + memo + "/submit", null).status()).isEqualTo(200);
    }

    // ============ последовательные этапы ============

    @Test
    void sequentialStagesActivateOneByOneAndTheDocumentEndsApproved() throws Exception {
        long memo = createDocument(company.frank, "OFFICIAL_MEMO");

        JsonNode submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + memo + "/submit", null));
        assertThat(submitted.path("status").asText()).isEqualTo("IN_APPROVAL");
        assertThat(stageStates(submitted)).containsExactly("ACTIVE", "WAITING");
        long bobStep = stepOf(submitted, company.bob);
        long aliceStep = stepOf(submitted, company.alice);
        assertThat(myActive(card(company.bob, memo))).containsExactly(bobStep);
        assertThat(myActive(card(company.alice, memo))).isEmpty();
        assertThat(waitingMe(company.bob)).isEqualTo(1);
        assertThat(waitingMe(company.alice)).isZero();

        // директор не может решить за руководителя: его этап ещё не начался
        Resp early = decide(company.alice, aliceStep, "APPROVE", null);
        assertThat(early.status()).isEqualTo(409);
        assertThat(early.code()).isEqualTo("STEP_NOT_ACTIVE");

        JsonNode afterBob = ok(decide(company.bob, bobStep, "APPROVE", null));
        assertThat(stageStates(afterBob)).containsExactly("DONE", "ACTIVE");
        assertThat(afterBob.path("status").asText()).isEqualTo("IN_APPROVAL");
        assertThat(myActive(card(company.alice, memo))).containsExactly(aliceStep);
        assertThat(waitingMe(company.alice)).isEqualTo(1);
        assertThat(waitingMe(company.bob)).isZero();
        // двойной клик безопасен: повтор того же решения — 200 без изменений
        String decidedAt = jdbc.queryForObject("select decided_at::text from approval_step where id = ?", String.class, bobStep);
        assertThat(ok(decide(company.bob, bobStep, "APPROVE", null)).path("status").asText()).isEqualTo("IN_APPROVAL");
        assertThat(jdbc.queryForObject("select decided_at::text from approval_step where id = ?", String.class, bobStep))
                .isEqualTo(decidedAt);

        JsonNode approved = ok(decide(company.alice, aliceStep, "APPROVE", "Согласовано"));
        assertThat(approved.path("status").asText()).isEqualTo("APPROVED");
        assertThat(stageStates(approved)).containsExactly("DONE", "DONE");
        assertThat(jdbc.queryForObject("select current_stage from document where id = ?", Integer.class, memo)).isNull();
        // согласованный документ неизменяем: решение по закрытому шагу другим решением — конфликт
        assertThat(decide(company.alice, aliceStep, "RETURN", "поздно").code()).isEqualTo("STEP_NOT_ACTIVE");
        assertThat(card(company.frank, memo).path("permissions").path("canUploadVersion").asBoolean()).isFalse();
    }

    // ============ параллельный этап, выбор, добавленные согласующие ============

    @Test
    void parallelStageNeedsEveryParticipantAndSelectionIsValidated() throws Exception {
        long support = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");
        String submit = "/api/v1/documents/" + support + "/submit";
        long lawyerRole = company.roles.get("LAWYER");

        Resp none = call(company.frank, "POST", submit, null);
        assertThat(none.status()).isEqualTo(409);
        assertThat(none.code()).isEqualTo("SELECTION_REQUIRED");
        assertThat(call(company.frank, "POST", submit, Map.of("selections",
                List.of(choice(1, lawyerRole, company.bob.dbId)))).status()).as("не кандидат").isEqualTo(404);
        assertThat(call(company.frank, "POST", submit, Map.of("selections",
                List.of(choice(1, lawyerRole, company.erin.dbId)))).status()).as("не тот носитель роли").isEqualTo(404);
        assertThat(count("approval_step")).isZero();

        JsonNode submitted = ok(call(company.frank, "POST", submit,
                Map.of("selections", List.of(choice(1, lawyerRole, company.carol.dbId)))));
        assertThat(stageStates(submitted)).containsExactly("ACTIVE", "WAITING");
        long carolStep = stepOf(submitted, company.carol);
        long erinStep = stepOf(submitted, company.erin);
        long aliceStep = stepOf(submitted, company.alice);
        assertThat(call(company.dave, "GET", "/api/v1/documents/" + support, null).status())
                .as("Дэйв не выбран, шага у него нет, а документ приватный: он его не видит").isEqualTo(404);

        JsonNode afterCarol = ok(decide(company.carol, carolStep, "APPROVE", null));
        assertThat(stageStates(afterCarol)).as("этап закрыт только когда одобрили все").containsExactly("ACTIVE", "WAITING");
        assertThat(myActive(card(company.alice, support))).isEmpty();
        JsonNode afterErin = ok(decide(company.erin, erinStep, "APPROVE", null));
        assertThat(stageStates(afterErin)).containsExactly("DONE", "ACTIVE");
        assertThat(myActive(card(company.alice, support))).containsExactly(aliceStep);
        assertThat(ok(decide(company.alice, aliceStep, "APPROVE", null)).path("status").asText()).isEqualTo("APPROVED");
    }

    @Test
    void addedApproverJoinsTheirRoleAndTheRouteOnlyGrows() throws Exception {
        long support = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");
        long lawyerRole = company.roles.get("LAWYER");

        // автор не может быть добавлен, а не носитель роли выглядит как «не найден»
        assertThat(call(company.frank, "POST", "/api/v1/documents/" + support + "/submit", Map.of(
                "selections", List.of(choice(1, lawyerRole, company.carol.dbId)),
                "extraApprovers", List.of(choice(1, company.roles.get("ACCOUNTANT"), company.frank.dbId)))).status())
                .isEqualTo(400);
        assertThat(call(company.frank, "POST", "/api/v1/documents/" + support + "/submit", Map.of(
                "selections", List.of(choice(1, lawyerRole, company.carol.dbId)),
                "extraApprovers", List.of(choice(1, lawyerRole, company.erin.dbId)))).status()).isEqualTo(404);
        assertThat(card(company.frank, support).path("permissions").path("canAddApprover").asBoolean()).isTrue();

        JsonNode submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + support + "/submit", Map.of(
                "selections", List.of(choice(1, lawyerRole, company.carol.dbId)),
                "extraApprovers", List.of(choice(1, lawyerRole, company.dave.dbId)))));

        JsonNode firstStage = submitted.path("route").path("stages").get(0).path("steps");
        assertThat(firstStage).hasSize(3);
        JsonNode extra = null;
        for (JsonNode step : firstStage) {
            if ("ADDED_BY_AUTHOR".equals(step.path("origin").asText())) {
                extra = step;
            }
        }
        assertThat(extra).isNotNull();
        assertThat(extra.path("approver").path("id").asLong()).isEqualTo(company.dave.dbId);
        assertThat(extra.path("role").path("code").asText()).isEqualTo("LAWYER");
        // добавленный видит документ и решает наравне с шаблонными
        assertThat(myActive(card(company.dave, support))).hasSize(1);
    }

    // ============ возврат, повторная отправка, отклонение ============

    @Test
    void returnSkipsTheRestAndTheDocumentIsResubmittedFromTheFirstStageAsANewVersion() throws Exception {
        long support = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");
        long lawyerRole = company.roles.get("LAWYER");
        JsonNode submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + support + "/submit",
                Map.of("selections", List.of(choice(1, lawyerRole, company.carol.dbId)))));
        long carolStep = stepOf(submitted, company.carol);
        long erinStep = stepOf(submitted, company.erin);

        Resp noComment = decide(company.carol, carolStep, "RETURN", "   ");
        assertThat(noComment.status()).isEqualTo(400);
        assertThat(noComment.code()).isEqualTo("COMMENT_REQUIRED");

        JsonNode returned = ok(decide(company.carol, carolStep, "RETURN", "Уточните сумму"));
        assertThat(returned.path("status").asText()).isEqualTo("RETURNED");
        assertThat(decisions(returned)).containsExactly("RETURNED", "SKIPPED", "SKIPPED");
        assertThat(jdbc.queryForObject("select current_stage from document where id = ?", Integer.class, support)).isNull();
        Resp late = decide(company.erin, erinStep, "APPROVE", null);
        assertThat(late.status()).isEqualTo(409);
        assertThat(late.code()).isEqualTo("STEP_NOT_ACTIVE");
        assertThat(late.json().path("message").asText()).isEqualTo("Документ уже возвращён");
        assertThat(card(company.frank, support).path("permissions").path("canUploadVersion").asBoolean()).isTrue();

        // исправление — новая версия (#16): документ снова черновик, старые шаги остаются историей
        long fileId = returned.path("versions").get(0).path("files").get(0).path("id").asLong();
        JsonNode draft = ok(newVersion(company.frank, support, fileId));
        assertThat(draft.path("status").asText()).isEqualTo("DRAFT");
        assertThat(draft.path("currentVersionNo").asInt()).isEqualTo(2);
        assertThat(draft.path("route").path("history")).hasSize(3);

        JsonNode resubmitted = ok(call(company.frank, "POST", "/api/v1/documents/" + support + "/submit",
                Map.of("selections", List.of(choice(1, lawyerRole, company.dave.dbId)))));
        assertThat(resubmitted.path("route").path("versionNo").asInt()).isEqualTo(2);
        assertThat(stageStates(resubmitted)).as("новая версия начинается с первого этапа").containsExactly("ACTIVE", "WAITING");
        assertThat(resubmitted.path("route").path("history")).hasSize(3);
        assertThat(jdbc.queryForObject("select count(*) from approval_step where version_no = 1 and decision = 'PENDING'",
                Integer.class)).as("прежние ожидающие шаги остались SKIPPED, а не ожили").isZero();

        long daveStep = stepOf(resubmitted, company.dave);
        long erinStep2 = stepOf(resubmitted, company.erin);
        long aliceStep2 = stepOf(resubmitted, company.alice);
        ok(decide(company.dave, daveStep, "APPROVE", null));
        ok(decide(company.erin, erinStep2, "APPROVE", null));
        assertThat(ok(decide(company.alice, aliceStep2, "APPROVE", null)).path("status").asText()).isEqualTo("APPROVED");
    }

    @Test
    void rejectionIsFinal() throws Exception {
        long memo = createDocument(company.frank, "OFFICIAL_MEMO");
        JsonNode submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + memo + "/submit", null));
        long bobStep = stepOf(submitted, company.bob);
        long aliceStep = stepOf(submitted, company.alice);

        JsonNode rejected = ok(decide(company.bob, bobStep, "REJECT", "Не по регламенту"));

        assertThat(rejected.path("status").asText()).isEqualTo("REJECTED");
        assertThat(decisions(rejected)).containsExactly("REJECTED", "SKIPPED");
        assertThat(decide(company.alice, aliceStep, "APPROVE", null).code()).isEqualTo("STEP_NOT_ACTIVE");
        assertThat(card(company.frank, memo).path("permissions").path("canUploadVersion").asBoolean()).isFalse();
        assertThat(call(company.frank, "POST", "/api/v1/documents/" + memo + "/submit", null).code()).isEqualTo("INVALID_STATE");
    }

    // ============ маленькая компания ============

    @Test
    void documentOfAOnePersonCompanyIsApprovedAtOnceWithAVisibleAutoApproval() throws Exception {
        Person solo = newUser();
        ok(call(solo, "POST", "/api/v1/orgs", Map.of("name", "Одиночка")), 201);
        long memo = createDocument(solo, "OFFICIAL_MEMO");

        JsonNode approved = ok(call(solo, "POST", "/api/v1/documents/" + memo + "/submit", null));

        assertThat(approved.path("status").asText()).isEqualTo("APPROVED");
        JsonNode step = approved.path("route").path("stages").get(0).path("steps").get(0);
        assertThat(step.path("autoReason").asText()).isEqualTo("AUTHOR_HOLDS_ROLE");
        assertThat(step.path("decision").asText()).isEqualTo("APPROVED");
        assertThat(step.path("approver").path("id").asLong()).isEqualTo(solo.dbId);
        assertThat(step.path("decidedAt").isNull()).isFalse();
    }

    // ============ права и идентификаторы ============

    @Test
    void submissionAndDecisionsAreScopedToTheirOwners() throws Exception {
        long memo = createDocument(company.frank, "OFFICIAL_MEMO");
        String submit = "/api/v1/documents/" + memo + "/submit";
        String preview = "/api/v1/documents/" + memo + "/route-preview";

        // до отправки чужой документ не виден: 404, а не 403
        assertThat(call(company.bob, "POST", submit, null).status()).isEqualTo(404);
        assertThat(call(company.bob, "GET", preview, null).status()).isEqualTo(404);
        assertThat(call(company.carol, "POST", "/api/v1/documents/999999/submit", null).status()).isEqualTo(404);

        JsonNode submitted = ok(call(company.frank, "POST", submit, null));
        long bobStep = stepOf(submitted, company.bob);
        // после отправки Боб видит документ, но не автор: 403
        assertThat(call(company.bob, "POST", submit, null).status()).isEqualTo(403);
        assertThat(call(company.bob, "GET", preview, null).status()).isEqualTo(403);
        // повторная отправка автором: документ уже не черновик
        assertThat(call(company.frank, "POST", submit, null).status()).isEqualTo(409);

        // чужой шаг выглядит несуществующим; человеку без компании отвечают как везде в документах: нужна компания
        assertThat(decide(company.erin, bobStep, "APPROVE", null).status()).isEqualTo(404);
        assertThat(decide(company.frank, bobStep, "APPROVE", null).status()).isEqualTo(404);
        Person outsider = newUser();
        assertThat(decide(outsider, bobStep, "APPROVE", null).status()).isEqualTo(403);
        assertThat(jdbc.queryForObject("select decision from approval_step where id = ?", String.class, bobStep))
                .isEqualTo("PENDING");
    }

    @Test
    void administratorCannotRemoveTheRoleOfSomeoneWhoseDecisionIsAwaited() throws Exception {
        long support = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");
        ok(call(company.frank, "POST", "/api/v1/documents/" + support + "/submit",
                Map.of("selections", List.of(choice(1, company.roles.get("LAWYER"), company.carol.dbId)))));

        Resp removal = call(company.alice, "PUT", "/api/v1/orgs/current/members/" + memberId(company.carol) + "/roles",
                Map.of("roleIds", List.of()));

        assertThat(removal.status()).isEqualTo(409);
        assertThat(removal.code()).isEqualTo("MEMBER_HAS_PENDING_STEPS");
    }

    // ============ демо-режим: проверяющий один проходит всю цепочку ============

    @Test
    void reviewerActingAsDemoParticipantsPassesTheWholeChainAlone() throws Exception {
        Person reviewer = newUser();
        JsonNode sandbox = ok(call(reviewer, "POST", "/api/v1/demo/sandbox", null));
        long demoAuthor = demoUser(sandbox, "DEPARTMENT_HEAD");
        long demoDirector = demoUser(sandbox, "DIRECTOR");

        long memo = createDocumentAs(reviewer, demoAuthor, "OFFICIAL_MEMO");
        JsonNode submitted = ok(callAs(reviewer, demoAuthor, "POST", "/api/v1/documents/" + memo + "/submit", null));
        assertThat(submitted.path("status").asText()).isEqualTo("IN_APPROVAL");

        JsonNode directorCard = ok(callAs(reviewer, demoDirector, "GET", "/api/v1/documents/" + memo, null));
        assertThat(myActive(directorCard)).hasSize(1);
        JsonNode approved = ok(callAs(reviewer, demoDirector, "POST",
                "/api/v1/approval-steps/" + myActive(directorCard).get(0) + "/decision",
                Map.of("decision", "APPROVE")));
        assertThat(approved.path("status").asText()).isEqualTo("APPROVED");
    }

    // ============ гонки: очередь на блокировку строки документа ============

    @Test
    void approvalThatWinsTheRaceDoesNotStopALaterReturnOnAParallelStage() throws Exception {
        Race race = raceOnParallelStage(true);

        assertThat(race.carol().status()).as(race.carol().body()).isEqualTo(200);
        assertThat(race.erin().status()).as(race.erin().body()).isEqualTo(200);
        assertThat(status(race.documentId())).isEqualTo("RETURNED");
        assertThat(stepDecisions(race.documentId())).containsExactly("APPROVED", "RETURNED", "SKIPPED");
    }

    @Test
    void returnThatWinsTheRaceMakesTheLaterApprovalFailWithAnExplanation() throws Exception {
        Race race = raceOnParallelStage(false);

        assertThat(race.erin().status()).as(race.erin().body()).isEqualTo(200);
        assertThat(race.carol().status()).as(race.carol().body()).isEqualTo(409);
        assertThat(race.carol().code()).isEqualTo("STEP_NOT_ACTIVE");
        assertThat(race.carol().json().path("message").asText()).isEqualTo("Документ уже возвращён");
        assertThat(status(race.documentId())).isEqualTo("RETURNED");
        assertThat(stepDecisions(race.documentId())).containsExactly("SKIPPED", "RETURNED", "SKIPPED");
    }

    @Test
    void doubleClickOnTheSameDecisionIsAppliedOnce() throws Exception {
        long memo = createDocument(company.frank, "OFFICIAL_MEMO");
        JsonNode submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + memo + "/submit", null));
        long bobStep = stepOf(submitted, company.bob);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try (Connection holder = holdLock("select id from document where id = ? for update", memo)) {
            Future<Resp> first = pool.submit(() -> decide(company.bob, bobStep, "APPROVE", null));
            waitForBlockedSessions(1);
            Future<Resp> second = pool.submit(() -> decide(company.bob, bobStep, "APPROVE", null));
            waitForBlockedSessions(2);
            holder.commit();
            assertThat(first.get(20, TimeUnit.SECONDS).status()).isEqualTo(200);
            assertThat(second.get(20, TimeUnit.SECONDS).status()).isEqualTo(200);
        } finally {
            pool.shutdownNow();
        }

        assertThat(stepDecisions(memo)).containsExactly("APPROVED", "PENDING");
        assertThat(jdbc.queryForObject("select current_stage from document where id = ?", Integer.class, memo)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from approval_step where document_id = ? and activated_at is not null",
                Integer.class, memo)).isEqualTo(2);
    }

    @Test
    void twoApproversClosingAParallelStageAtOnceAdvanceTheDocumentExactlyOnce() throws Exception {
        long support = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");
        JsonNode submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + support + "/submit",
                Map.of("selections", List.of(choice(1, company.roles.get("LAWYER"), company.carol.dbId)))));
        long carolStep = stepOf(submitted, company.carol);
        long erinStep = stepOf(submitted, company.erin);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try (Connection holder = holdLock("select id from document where id = ? for update", support)) {
            Future<Resp> carol = pool.submit(() -> decide(company.carol, carolStep, "APPROVE", null));
            waitForBlockedSessions(1);
            Future<Resp> erin = pool.submit(() -> decide(company.erin, erinStep, "APPROVE", null));
            waitForBlockedSessions(2);
            holder.commit();
            assertThat(carol.get(20, TimeUnit.SECONDS).status()).isEqualTo(200);
            assertThat(erin.get(20, TimeUnit.SECONDS).status()).isEqualTo(200);
        } finally {
            pool.shutdownNow();
        }

        assertThat(stepDecisions(support)).containsExactly("APPROVED", "APPROVED", "PENDING");
        assertThat(jdbc.queryForObject("select current_stage from document where id = ?", Integer.class, support)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select activated_at is not null from approval_step where document_id = ? and stage_order = 2",
                Boolean.class, support)).isTrue();
        assertThat(status(support)).isEqualTo("IN_APPROVAL");
    }

    // ============ ревью #48: найденные инварианты ============

    @Test
    void addedApproverWhoIsAlreadyInTheRouteIsRejectedAndNoStepIsDoubled() throws Exception {
        long support = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");
        String submit = "/api/v1/documents/" + support + "/submit";
        long lawyer = company.roles.get("LAWYER");
        long accountant = company.roles.get("ACCOUNTANT");
        List<Object> carolChosen = List.of(choice(1, lawyer, company.carol.dbId));

        // Эрин подставлена автоматически (единственный бухгалтер): «добавить» её нельзя
        Resp auto = call(company.frank, "POST", submit, Map.of("selections", carolChosen,
                "extraApprovers", List.of(choice(1, accountant, company.erin.dbId))));
        assertThat(auto.status()).isEqualTo(400);
        assertThat(auto.code()).isEqualTo("VALIDATION_FAILED");
        // Карол выбрана автором в этой же отправке
        Resp selected = call(company.frank, "POST", submit, Map.of("selections", carolChosen,
                "extraApprovers", List.of(choice(1, lawyer, company.carol.dbId))));
        assertThat(selected.status()).isEqualTo(400);
        assertThat(selected.code()).isEqualTo("VALIDATION_FAILED");
        assertThat(count("approval_step")).as("ничего не сохранено").isZero();
        assertThat(status(support)).isEqualTo("DRAFT");

        // Дэйв — второй юрист, не выбранный автором: настоящее добавление, шагов ровно четыре
        ok(call(company.frank, "POST", submit, Map.of("selections", carolChosen,
                "extraApprovers", List.of(choice(1, lawyer, company.dave.dbId)))));
        assertThat(count("approval_step")).isEqualTo(4);
        assertThat(jdbc.queryForObject("select count(distinct (stage_order, role_id, approver_id)) from approval_step"
                + " where document_id = ?", Integer.class, support)).as("одинаковых шагов нет").isEqualTo(4);
    }

    @Test
    void stageWaitsForEveryStepThatWasCreatedWhetherTheTemplateCallsItMandatoryOrNot() throws Exception {
        // этап из обязательного бухгалтера и необязательного юриста, у которого носитель нашёлся
        jdbc.update("update approval_route set is_mandatory = true where role_id = ?", company.roles.get("ACCOUNTANT"));
        List<Object> carolChosen = List.of(choice(1, company.roles.get("LAWYER"), company.carol.dbId));

        long first = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");
        JsonNode submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + first + "/submit",
                Map.of("selections", carolChosen)));
        long carolStep = stepOf(submitted, company.carol);
        long erinStep = stepOf(submitted, company.erin);
        assertThat(stageStates(ok(decide(company.erin, erinStep, "APPROVE", null))))
                .as("обязательный одобрил, необязательный с носителем ещё не решил").containsExactly("ACTIVE", "WAITING");
        assertThat(stageStates(ok(decide(company.carol, carolStep, "APPROVE", null)))).containsExactly("DONE", "ACTIVE");

        long second = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");
        submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + second + "/submit", Map.of("selections", carolChosen)));
        assertThat(stageStates(ok(decide(company.carol, stepOf(submitted, company.carol), "APPROVE", null))))
                .as("необязательный одобрил, обязательный ещё нет").containsExactly("ACTIVE", "WAITING");
        assertThat(stageStates(ok(decide(company.erin, stepOf(submitted, company.erin), "APPROVE", null))))
                .containsExactly("DONE", "ACTIVE");
    }

    @Test
    void optionalRoleWithNoHolderIsSkippedAndTheStageClosesOnTheOthers() throws Exception {
        jdbc.update("delete from member_role where role_id = ?", company.roles.get("LAWYER"));
        long support = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");

        JsonNode preview = ok(call(company.frank, "GET", "/api/v1/documents/" + support + "/route-preview", null));
        assertThat(preview.path("stages").get(0).path("participants").get(0).path("resolution").asText()).isEqualTo("SKIPPED");
        JsonNode submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + support + "/submit", null));
        assertThat(count("approval_step")).as("Эрин и Алиса, шага юриста нет").isEqualTo(2);

        assertThat(stageStates(ok(decide(company.erin, stepOf(submitted, company.erin), "APPROVE", null))))
                .containsExactly("DONE", "ACTIVE");
    }

    @Test
    void personWithoutCompanyCannotTellAnExistingDocumentFromAMissingOne() throws Exception {
        long memo = createDocument(company.frank, "OFFICIAL_MEMO");
        Person outsider = newUser();

        for (String tail : List.of("/submit", "/route-preview")) {
            Resp existing = call(outsider, tail.equals("/submit") ? "POST" : "GET", "/api/v1/documents/" + memo + tail, null);
            Resp missing = call(outsider, tail.equals("/submit") ? "POST" : "GET", "/api/v1/documents/987654321" + tail, null);
            assertThat(existing.status()).as(tail).isEqualTo(403);
            assertThat(missing.status()).as(tail).isEqualTo(403);
            assertThat(existing.body()).as("ответы неотличимы").isEqualTo(missing.body());
        }
        assertThat(status(memo)).isEqualTo("DRAFT");
    }

    @Test
    void firstRequestsFromTwoDocumentsCreateTheDefaultRouteOnceAndBothSucceed() throws Exception {
        long docA = createDocument(company.frank, "OFFICIAL_MEMO");
        long docB = createDocument(company.frank, "OFFICIAL_MEMO");
        long orgId = jdbc.queryForObject("select id from organization limit 1", Long.class);
        long typeId = jdbc.queryForObject("select id from document_type where code = 'OFFICIAL_MEMO'", Long.class);
        List<Map<String, Object>> template = jdbc.queryForList("select stage_order, role_id, is_mandatory from approval_route"
                + " where org_id = ? and document_type_id = ? order by stage_order, id", orgId, typeId);
        assertThat(template).hasSize(2);
        jdbc.update("delete from approval_route where org_id = ? and document_type_id = ?", orgId, typeId);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        // «другая транзакция» уже вставила маршрут, но ещё не зафиксировала: обе проверки «маршрута нет» это не видят
        try (Connection other = dataSource.getConnection()) {
            other.setAutoCommit(false);
            for (Map<String, Object> row : template) {
                try (PreparedStatement insert = other.prepareStatement("insert into approval_route"
                        + " (org_id, document_type_id, stage_order, role_id, is_mandatory) values (?, ?, ?, ?, ?)")) {
                    insert.setLong(1, orgId);
                    insert.setLong(2, typeId);
                    insert.setInt(3, ((Number) row.get("stage_order")).intValue());
                    insert.setLong(4, ((Number) row.get("role_id")).longValue());
                    insert.setBoolean(5, (Boolean) row.get("is_mandatory"));
                    insert.executeUpdate();
                }
            }
            Future<Resp> first = pool.submit(() -> call(company.frank, "GET", "/api/v1/documents/" + docA + "/route-preview", null));
            Future<Resp> second = pool.submit(() -> call(company.frank, "GET", "/api/v1/documents/" + docB + "/route-preview", null));
            waitForBlockedSessions(2);
            other.commit();

            for (Future<Resp> response : List.of(first, second)) {
                Resp resp = response.get(20, TimeUnit.SECONDS);
                assertThat(resp.status()).as(resp.body()).isEqualTo(200);
                assertThat(resp.json().path("stages")).hasSize(2);
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(jdbc.queryForObject("select count(*) from approval_route where org_id = ? and document_type_id = ?",
                Integer.class, orgId, typeId)).isEqualTo(2);
    }

    @Test
    void routeMissingForAnEmptyCompanyIsCreatedOnFirstPreviewAndSubmitStillWorks() throws Exception {
        long orgId = jdbc.queryForObject("select id from organization limit 1", Long.class);
        jdbc.update("delete from approval_route where org_id = ?", orgId);
        long memo = createDocument(company.frank, "OFFICIAL_MEMO");

        ok(call(company.frank, "GET", "/api/v1/documents/" + memo + "/route-preview", null));
        assertThat(jdbc.queryForObject("select count(*) from approval_route where org_id = ?", Integer.class, orgId))
                .as("маршруты по умолчанию всех четырёх типов: 2 + 2 + 3 + 1").isEqualTo(8);
        assertThat(count("approval_step")).as("предпросмотр шагов не создаёт").isZero();
        assertThat(status(memo)).isEqualTo("DRAFT");
        assertThat(call(company.frank, "POST", "/api/v1/documents/" + memo + "/submit", null).status()).isEqualTo(200);
    }

    @Test
    void commentLengthIsMeasuredAfterTrimmingAndABlankCommentIsMissingNotTooLong() throws Exception {
        long memo = createDocument(company.frank, "OFFICIAL_MEMO");
        JsonNode submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + memo + "/submit", null));
        long bobStep = stepOf(submitted, company.bob);
        String limit = "я".repeat(2000);

        Resp tooLong = decide(company.bob, bobStep, "RETURN", limit + "я");
        assertThat(tooLong.status()).isEqualTo(400);
        assertThat(tooLong.code()).isEqualTo("VALIDATION_FAILED");
        Resp blank = decide(company.bob, bobStep, "RETURN", " ".repeat(5000));
        assertThat(blank.status()).isEqualTo(400);
        assertThat(blank.code()).isEqualTo("COMMENT_REQUIRED");
        assertThat(stepDecisions(memo)).containsExactly("PENDING", "PENDING");

        ok(decide(company.bob, bobStep, "RETURN", "  " + limit + "  "));
        assertThat(jdbc.queryForObject("select length(comment) from approval_step where id = ?", Integer.class, bobStep))
                .isEqualTo(2000);
    }

    // ============ вспомогательное: гонка ============

    private record Race(long documentId, Resp carol, Resp erin) {
    }

    /** Карол одобряет, Эрин возвращает — на параллельном этапе; кто встал в очередь первым, тот и выиграл. */
    private Race raceOnParallelStage(boolean carolQueuesFirst) throws Exception {
        long support = createDocument(company.frank, "SUPPORT_MEASURE_REQUEST");
        JsonNode submitted = ok(call(company.frank, "POST", "/api/v1/documents/" + support + "/submit",
                Map.of("selections", List.of(choice(1, company.roles.get("LAWYER"), company.carol.dbId)))));
        long carolStep = stepOf(submitted, company.carol);
        long erinStep = stepOf(submitted, company.erin);
        Callable<Resp> approve = () -> decide(company.carol, carolStep, "APPROVE", null);
        Callable<Resp> returnIt = () -> decide(company.erin, erinStep, "RETURN", "Нужны уточнения");

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try (Connection holder = holdLock("select id from document where id = ? for update", support)) {
            Future<Resp> first = pool.submit(carolQueuesFirst ? approve : returnIt);
            waitForBlockedSessions(1);
            Future<Resp> second = pool.submit(carolQueuesFirst ? returnIt : approve);
            waitForBlockedSessions(2);
            holder.commit();
            Resp carol = (carolQueuesFirst ? first : second).get(20, TimeUnit.SECONDS);
            Resp erin = (carolQueuesFirst ? second : first).get(20, TimeUnit.SECONDS);
            return new Race(support, carol, erin);
        } finally {
            pool.shutdownNow();
        }
    }

    // ============ вспомогательное: компания и документы ============

    private record Person(long devId, long dbId) {
        String auth() {
            return "Dev " + devId;
        }
    }

    private record Company(Person alice, Person bob, Person carol, Person dave, Person erin, Person frank,
                           Map<String, Long> roles) {
    }

    /** Алиса — директор и администратор; Боб — руководитель отдела; Карол и Дэйв — юристы; Эрин — бухгалтер; Фрэнк — автор. */
    private Company newCompany(String name) throws Exception {
        Person alice = newUser();
        ok(call(alice, "POST", "/api/v1/orgs", Map.of("name", name)), 201);
        Map<String, Long> roles = new HashMap<>();
        for (JsonNode role : ok(call(alice, "GET", "/api/v1/orgs/current/roles", null))) {
            roles.put(role.path("code").asText(), role.path("id").asLong());
        }
        String code = ok(call(alice, "GET", "/api/v1/orgs/current/invite-code", null)).path("code").asText();
        Person bob = join(alice, code, roles.get("DEPARTMENT_HEAD"));
        Person carol = join(alice, code, roles.get("LAWYER"));
        Person dave = join(alice, code, roles.get("LAWYER"));
        Person erin = join(alice, code, roles.get("ACCOUNTANT"));
        Person frank = join(alice, code, roles.get("HR"));
        return new Company(alice, bob, carol, dave, erin, frank, roles);
    }

    private Person join(Person admin, String code, long roleId) throws Exception {
        Person person = newUser();
        long requestId = ok(call(person, "POST", "/api/v1/join-requests", Map.of("code", code)), 201).path("id").asLong();
        ok(call(admin, "POST", "/api/v1/orgs/current/join-requests/" + requestId + "/approve",
                Map.of("roleIds", List.of(roleId))));
        return person;
    }

    private Person newUser() throws Exception {
        long devId = MAX_IDS.incrementAndGet();
        // первый запрос создаёт пользователя в базе
        ok(call(new Person(devId, 0), "GET", "/api/v1/me", null));
        long dbId = jdbc.queryForObject("select id from app_user where max_user_id = ?", Long.class, devId);
        return new Person(devId, dbId);
    }

    private long createDocument(Person author, String typeCode) throws Exception {
        return createDocumentWith(author.auth(), null, typeCode);
    }

    private long createDocumentAs(Person reviewer, long actorId, String typeCode) throws Exception {
        return createDocumentWith(reviewer.auth(), actorId, typeCode);
    }

    private long createDocumentWith(String auth, Long actAs, String typeCode) throws Exception {
        long typeId = jdbc.queryForObject("select id from document_type where code = ?", Long.class, typeCode);
        Map<String, Object> meta = Map.of("documentTypeId", typeId, "title", "Документ " + UUID.randomUUID(),
                "visibility", "PRIVATE", "containsSensitive", false);
        MockHttpServletRequestBuilder request = multipart("/api/v1/documents")
                .file(new MockMultipartFile("meta", "", "application/json", MAPPER.writeValueAsBytes(meta)))
                .file(new MockMultipartFile("main", "doc.pdf", "application/pdf", pdf()))
                .header("Authorization", auth);
        if (actAs != null) {
            request.header("X-Demo-Act-As", actAs);
        }
        MvcResult result = mvc.perform(request).andReturn();
        Resp response = new Resp(result.getResponse().getStatus(), result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        return ok(response, 201).path("id").asLong();
    }

    private Resp newVersion(Person author, long documentId, long keepFileId) throws Exception {
        Map<String, Object> meta = Map.of("containsSensitive", false, "keepFileIds", List.of(keepFileId));
        MvcResult result = mvc.perform(multipart("/api/v1/documents/" + documentId + "/versions")
                .file(new MockMultipartFile("meta", "", "application/json", MAPPER.writeValueAsBytes(meta)))
                .header("Authorization", author.auth())).andReturn();
        return new Resp(result.getResponse().getStatus(), result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static long demoUser(JsonNode sandbox, String roleCode) {
        for (JsonNode user : sandbox.path("users")) {
            for (JsonNode role : user.path("roles")) {
                if (roleCode.equals(role.path("code").asText())) {
                    return user.path("user").path("id").asLong();
                }
            }
        }
        throw new IllegalStateException("В песочнице нет участника с ролью " + roleCode);
    }

    private JsonNode card(Person person, long documentId) throws Exception {
        return ok(call(person, "GET", "/api/v1/documents/" + documentId, null));
    }

    private Resp decide(Person person, long stepId, String decision, String comment) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("decision", decision);
        if (comment != null) {
            body.put("comment", comment);
        }
        return call(person, "POST", "/api/v1/approval-steps/" + stepId + "/decision", body);
    }

    private static Map<String, Object> choice(int stage, long roleId, long userId) {
        return Map.of("stageOrder", stage, "roleId", roleId, "userId", userId);
    }

    /** Шаг человека в текущей версии карточки. */
    private static long stepOf(JsonNode card, Person person) {
        for (JsonNode stage : card.path("route").path("stages")) {
            for (JsonNode step : stage.path("steps")) {
                if (step.path("approver").path("id").asLong() == person.dbId) {
                    return step.path("id").asLong();
                }
            }
        }
        throw new IllegalStateException("У пользователя нет шага в маршруте");
    }

    private static List<String> stageStates(JsonNode card) {
        List<String> states = new ArrayList<>();
        card.path("route").path("stages").forEach(stage -> states.add(stage.path("state").asText()));
        return states;
    }

    private static List<String> decisions(JsonNode card) {
        List<String> result = new ArrayList<>();
        card.path("route").path("stages").forEach(stage -> stage.path("steps")
                .forEach(step -> result.add(step.path("decision").asText())));
        return result;
    }

    private static List<Long> myActive(JsonNode card) {
        List<Long> ids = new ArrayList<>();
        card.path("myActiveStepIds").forEach(id -> ids.add(id.asLong()));
        return ids;
    }

    private int waitingMe(Person person) throws Exception {
        return ok(call(person, "GET", "/api/v1/documents?tab=WAITING_ME", null)).path("total").asInt();
    }

    private String status(long documentId) {
        return jdbc.queryForObject("select status from document where id = ?", String.class, documentId);
    }

    private List<String> stepDecisions(long documentId) {
        return jdbc.queryForList("select decision from approval_step where document_id = ? order by stage_order, id",
                String.class, documentId);
    }

    private long memberId(Person person) {
        return jdbc.queryForObject("select id from organization_member where user_id = ?", Long.class, person.dbId);
    }

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    // ============ вспомогательное: HTTP и блокировки ============

    private record Resp(int status, String body) {
        JsonNode json() {
            try {
                return body == null || body.isBlank() ? MAPPER.createObjectNode() : MAPPER.readTree(body);
            } catch (Exception exception) {
                throw new IllegalStateException(body, exception);
            }
        }

        String code() {
            return json().path("code").asText();
        }
    }

    private static JsonNode ok(Resp response) {
        return ok(response, 200);
    }

    private static JsonNode ok(Resp response, int status) {
        assertThat(response.status()).as(response.body()).isEqualTo(status);
        return response.json();
    }

    private Resp call(Person person, String method, String path, Object body) throws Exception {
        return exchange(person.auth(), null, method, path, body);
    }

    private Resp callAs(Person reviewer, long actorId, String method, String path, Object body) throws Exception {
        return exchange(reviewer.auth(), actorId, method, path, body);
    }

    private Resp exchange(String auth, Long actAs, String method, String path, Object body) throws Exception {
        MockHttpServletRequestBuilder builder = request(HttpMethod.valueOf(method), path).header("Authorization", auth);
        if (actAs != null) {
            builder.header("X-Demo-Act-As", actAs);
        }
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(MAPPER.writeValueAsBytes(body));
        }
        MvcResult result = mvc.perform(builder).andReturn();
        return new Resp(result.getResponse().getStatus(), result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private Connection holdLock(String sql, Object... args) throws SQLException {
        Connection connection = dataSource.getConnection();
        try {
            connection.setAutoCommit(false);
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                for (int i = 0; i < args.length; i++) {
                    statement.setObject(i + 1, args[i]);
                }
                statement.execute();
            }
            return connection;
        } catch (SQLException exception) {
            connection.close();
            throw exception;
        }
    }

    private void waitForBlockedSessions(int expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            Integer blocked = jdbc.queryForObject("select count(*) from pg_stat_activity"
                    + " where datname = current_database() and wait_event_type = 'Lock'", Integer.class);
            if (blocked != null && blocked >= expected) {
                return;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("Не дождались заблокированных сессий: " + expected);
    }

    private static byte[] pdf() throws IOException {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(output);
            return output.toByteArray();
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class StorageConfiguration {

        @Bean
        @Primary
        InMemoryFileStorage inMemoryFileStorage() {
            return new InMemoryFileStorage();
        }
    }

    static final class InMemoryFileStorage implements FileStorage {

        private final Map<String, Stored> files = new ConcurrentHashMap<>();

        @Override
        public String put(InputStream content, String fileName, String contentType, long size) {
            try {
                String key = UUID.randomUUID().toString();
                files.put(key, new Stored(content.readAllBytes(), fileName, contentType));
                return key;
            } catch (IOException exception) {
                throw new IllegalStateException(exception);
            }
        }

        @Override
        public StoredFile get(String storageKey) {
            Stored stored = files.get(storageKey);
            if (stored == null) {
                throw new StoredFileNotFoundException();
            }
            return new StoredFile(new ByteArrayInputStream(stored.content()),
                    stored.fileName(), stored.contentType(), stored.content().length);
        }

        @Override
        public void delete(String storageKey) {
            files.remove(storageKey);
        }

        void clear() {
            files.clear();
        }

        private record Stored(byte[] content, String fileName, String contentType) {
        }
    }
}
