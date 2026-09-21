package ru.sibvibe.approval.document;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import ru.sibvibe.approval.storage.FileStorage;
import ru.sibvibe.approval.storage.StoredFileNotFoundException;
import ru.sibvibe.approval.document.service.DownloadTokenService;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@EnabledIfEnvironmentVariable(named = "SCHEMA_TEST_URL", matches = ".+")
class DocumentIntegrationTest {

    private static final String AUTHOR_AUTH = "Dev 920000001";
    private static final String FOREIGN_AUTH = "Dev 920000002";
    private static final String COLLEAGUE_AUTH = "Dev 920000003";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("SCHEMA_TEST_URL"));
        registry.add("spring.datasource.username", () -> "schema_test");
        registry.add("spring.datasource.password", () -> System.getenv("SCHEMA_TEST_PASSWORD"));
        registry.add("spring.autoconfigure.exclude",
                () -> "chat.giga.springai.autoconfigure.GigaChatAutoConfiguration");
        registry.add("app.download.secret",
                () -> "document-integration-test-secret-32-bytes");
        registry.add("max.mini-app.url", () -> "");
        registry.add("minio.endpoint", () -> "http://127.0.0.1:9000");
        registry.add("minio.access-key", () -> "test-access-key");
        registry.add("minio.secret-key", () -> "test-secret-key");
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private InMemoryFileStorage storage;

    private long authorId;
    private long foreignId;
    private long colleagueId;
    private long authorOrgId;
    private long typeId;

    @Autowired
    private DownloadTokenService tokenService;

    @BeforeEach
    void setUp() {
        cleanDatabase();
        storage.clear();
        authorId = user(920000001L, "Автор");
        foreignId = user(920000002L, "Чужой пользователь");
        colleagueId = user(920000003L, "Коллега");
        authorOrgId = organization("Компания автора", authorId);
        long foreignOrg = organization("Другая компания", foreignId);
        member(authorOrgId, authorId);
        member(authorOrgId, colleagueId);
        member(foreignOrg, foreignId);
        typeId = jdbc.queryForObject("""
                insert into document_type(name, code, is_generic)
                values ('Приказ', 'ISSUE16_ORDER', false) returning id
                """, Long.class);
        jdbc.update("""
                insert into document_type_field(document_type_id, field_name, field_type, label)
                values (?, 'number', 'STRING', 'Номер')
                """, typeId);
        jdbc.update("""
                insert into requirement_rule(document_type_id, field_name, description, check_type, kind,
                    severity, source_title, source_checked_at)
                values (?, 'number', 'Укажите номер', 'REQUIRED', 'PRODUCT_RULE', 'BLOCKER',
                    'Правила продукта', current_timestamp)
                """, typeId);
    }

    @AfterEach
    void tearDown() {
        cleanDatabase();
        storage.clear();
    }

    private void cleanDatabase() {
        String users = "select id from app_user where max_user_id in (920000001, 920000002, 920000003)";
        String organizations = "select id from organization where created_by in (" + users + ")";
        String documents = "select id from document where author_id in (" + users + ")";
        String versions = "select id from document_version where document_id in (" + documents + ")";
        jdbc.execute("delete from approval_step where document_id in (" + documents + ")");
        jdbc.execute("delete from approval_route where org_id in (" + organizations + ")");
        jdbc.execute("delete from document_file where version_id in (" + versions + ")");
        jdbc.execute("delete from document_version where document_id in (" + documents + ")");
        jdbc.execute("delete from document where id in (" + documents + ")");
        jdbc.execute("delete from requirement_rule where document_type_id in "
                + "(select id from document_type where code = 'ISSUE16_ORDER')");
        jdbc.execute("delete from document_type_field where document_type_id in "
                + "(select id from document_type where code = 'ISSUE16_ORDER')");
        jdbc.execute("delete from document_type where code = 'ISSUE16_ORDER'");
        jdbc.execute("delete from member_role where member_id in "
                + "(select id from organization_member where org_id in (" + organizations + "))");
        jdbc.execute("delete from join_request where org_id in (" + organizations + ") or user_id in (" + users + ")");
        jdbc.execute("delete from invite_role where invite_id in "
                + "(select id from invite where org_id in (" + organizations + "))");
        jdbc.execute("delete from invite where org_id in (" + organizations + ")");
        jdbc.execute("delete from organization_member where org_id in (" + organizations + ")");
        jdbc.execute("delete from role where org_id in (" + organizations + ")");
        jdbc.execute("delete from organization where id in (" + organizations + ")");
        jdbc.execute("delete from app_user where id in (" + users + ")");
    }

    @Test
    void documentLifecycleKeepsAclRulesAndSignedDownloadConsistent() throws Exception {
        byte[] pdf = pdf();
        mvc.perform(multipart("/api/v1/documents")
                        .file(textJsonPart("meta", Map.of(
                                "documentTypeId", typeId,
                                "title", "x".repeat(256),
                                "visibility", "PRIVATE",
                                "containsSensitive", false,
                                "fields", Map.of("number", "42"))))
                        .file(new MockMultipartFile("main", "memo.pdf", "application/pdf", pdf))
                        .header("Authorization", AUTHOR_AUTH))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(multipart("/api/v1/documents")
                        .file(textJsonPart("meta", Map.of(
                                "documentTypeId", typeId,
                                "title", "Приказ",
                                "visibility", "PRIVATE",
                                "containsSensitive", false,
                                "fields", Map.of("number", "x".repeat(10_001)))))
                        .file(new MockMultipartFile("main", "memo.pdf", "application/pdf", pdf))
                        .header("Authorization", AUTHOR_AUTH))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        JsonNode created = json(mvc.perform(multipart("/api/v1/documents")
                        .file(textJsonPart("meta", Map.of(
                                "documentTypeId", typeId,
                                "title", "Приказ № 42",
                                "visibility", "PRIVATE",
                                "containsSensitive", false,
                                "fields", Map.of("number", "42"))))
                        .file(new MockMultipartFile("main", "..\\secret.pdf", "text/plain", pdf))
                        .header("Authorization", AUTHOR_AUTH))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.check.status").value("CHECKED"))
                .andExpect(jsonPath("$.check.modelAvailable").value(false))
                .andExpect(jsonPath("$.check.issues").isEmpty())
                .andExpect(jsonPath("$.permissions.canSubmit").value(true))
                .andReturn().getResponse().getContentAsString());

        long documentId = created.path("id").asLong();
        JsonNode file = created.path("versions").get(0).path("files").get(0);
        long fileId = file.path("id").asLong();
        String downloadUrl = file.path("downloadUrl").asText();
        assertThat(file.path("fileName").asText()).isEqualTo("secret.pdf");
        assertThat(file.path("mimeType").asText()).isEqualTo("application/pdf");
        assertThat(created.toString()).doesNotContain("storageKey").doesNotContain("storage_key");

        mvc.perform(get(downloadUrl))
                .andExpect(status().isOk())
                .andExpect(content().bytes(pdf))
                .andExpect(header().string("Content-Type", "application/pdf"));
        mvc.perform(get(downloadUrl + "x"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mvc.perform(get(tokenService.issue(fileId, foreignId).url()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));

        mvc.perform(get("/api/v1/documents/{id}", documentId)
                        .header("Authorization", FOREIGN_AUTH))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/documents/{id}", documentId)
                        .header("Authorization", COLLEAGUE_AUTH))
                .andExpect(status().isNotFound());
        jdbc.update("update document set visibility = 'ORG' where id = ?", documentId);
        mvc.perform(get("/api/v1/documents/{id}", documentId)
                        .header("Authorization", COLLEAGUE_AUTH))
                .andExpect(status().isOk());
        mvc.perform(multipart("/api/v1/documents/{id}/versions", documentId)
                        .file(textJsonPart("meta", Map.of(
                                "containsSensitive", false,
                                "fields", Map.of("number", "43"),
                                "keepFileIds", new long[]{fileId})))
                        .header("Authorization", COLLEAGUE_AUTH))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(put("/api/v1/documents/{id}/versions/1/fields", documentId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(Map.of("fields", Map.of("number", "43"))))
                        .header("Authorization", COLLEAGUE_AUTH))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        jdbc.update("update document set visibility = 'PRIVATE' where id = ?", documentId);
        mvc.perform(get("/api/v1/documents")
                        .param("tab", "MINE")
                        .header("Authorization", FOREIGN_AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/documents")
                        .param("tab", "MINE")
                        .param("status", "DRAFT")
                        .param("typeId", Long.toString(typeId))
                        .header("Authorization", AUTHOR_AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(documentId));

        JsonNode versioned = json(mvc.perform(multipart("/api/v1/documents/{id}/versions", documentId)
                        .file(jsonPart("meta", Map.of(
                                "containsSensitive", true,
                                "fields", Map.of("number", "43"),
                                "keepFileIds", new long[]{fileId})))
                        .header("Authorization", AUTHOR_AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentVersionNo").value(2))
                .andExpect(jsonPath("$.versions.length()").value(2))
                .andReturn().getResponse().getContentAsString());
        assertThat(versioned.path("versions").get(1).path("files").get(0).path("id").asLong())
                .isNotEqualTo(fileId);
        assertThat(storage.putCount()).isEqualTo(1);

        mvc.perform(put("/api/v1/documents/{id}/versions/2/fields", documentId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(Map.of("fields", Map.of("number", ""))))
                        .header("Authorization", AUTHOR_AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CHECKED"))
                .andExpect(jsonPath("$.issues[0].ruleId").isNumber())
                .andExpect(jsonPath("$.issues[0].severity").value("BLOCKER"));

        long roleId = jdbc.queryForObject("""
                insert into role(org_id, code, name) values (?, 'REVIEWER', 'Проверяющий') returning id
                """, Long.class, authorOrgId);
        jdbc.update("""
                insert into approval_step(document_id, version_no, approver_id, role_id, stage_order,
                    origin, decision, created_at, decided_at)
                values (?, 1, ?, ?, 1, 'TEMPLATE', 'APPROVED', current_timestamp, current_timestamp)
                """, documentId, colleagueId, roleId);
        jdbc.update("""
                insert into approval_step(document_id, version_no, approver_id, role_id, stage_order,
                    origin, decision, created_at, activated_at)
                values (?, 2, ?, ?, 1, 'TEMPLATE', 'PENDING', current_timestamp, current_timestamp)
                """, documentId, colleagueId, roleId);
        jdbc.update("update document set status = 'IN_APPROVAL', current_stage = 1 where id = ?", documentId);

        JsonNode colleagueCard = json(mvc.perform(get("/api/v1/documents/{id}", documentId)
                        .header("Authorization", COLLEAGUE_AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.route.history[0].versionNo").value(1))
                .andExpect(jsonPath("$.myActiveStepIds.length()").value(1))
                .andReturn().getResponse().getContentAsString());
        String colleagueDownload = colleagueCard.path("versions").get(1).path("files").get(0)
                .path("downloadUrl").asText();
        mvc.perform(get(colleagueDownload))
                .andExpect(status().isOk())
                .andExpect(content().bytes(pdf));
        mvc.perform(get("/api/v1/documents")
                        .param("tab", "WAITING_ME")
                        .header("Authorization", COLLEAGUE_AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].waitingSince").isNotEmpty());
        jdbc.update("update organization_member set status = 'DISABLED' where user_id = ?", colleagueId);
        mvc.perform(get(colleagueDownload))
                .andExpect(status().isNotFound());

        assertThat(jdbc.queryForObject(
                "select count(*) from document_version where document_id = ?", Integer.class, documentId))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "select count(distinct storage_key) from document_file", Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select count(*) from document_version where check_status = 'CHECKED'", Integer.class))
                .isEqualTo(2);
    }

    private MockMultipartFile jsonPart(String name, Object value) throws Exception {
        return new MockMultipartFile(
                name, "", MediaType.APPLICATION_JSON_VALUE, objectMapper.writeValueAsBytes(value));
    }

    private MockMultipartFile textJsonPart(String name, Object value) throws Exception {
        return new MockMultipartFile(name, "", null, objectMapper.writeValueAsBytes(value));
    }

    private JsonNode json(String value) throws Exception {
        return objectMapper.readTree(value);
    }

    private long user(long maxUserId, String name) {
        return jdbc.queryForObject("""
                insert into app_user(max_user_id, full_name, created_at)
                values (?, ?, current_timestamp) returning id
                """, Long.class, maxUserId, name);
    }

    private long organization(String name, long creatorId) {
        return jdbc.queryForObject("""
                insert into organization(name, created_by, created_at, is_demo)
                values (?, ?, current_timestamp, false) returning id
                """, Long.class, name, creatorId);
    }

    private void member(long orgId, long userId) {
        jdbc.update("""
                insert into organization_member(org_id, user_id, status, is_admin, joined_at, is_demo)
                values (?, ?, 'ACTIVE', true, current_timestamp, false)
                """, orgId, userId);
    }

    private byte[] pdf() throws IOException {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(output);
            byte[] value = output.toByteArray();
            try (PDDocument ignored = Loader.loadPDF(value)) {
                return value;
            }
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
        private int putCount;

        @Override
        public String put(InputStream content, String fileName, String contentType, long size) {
            try {
                byte[] bytes = content.readAllBytes();
                String key = UUID.randomUUID().toString();
                files.put(key, new Stored(bytes, fileName, contentType));
                putCount++;
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
            return new StoredFile(
                    new ByteArrayInputStream(stored.content()),
                    stored.fileName(), stored.contentType(), stored.content().length);
        }

        @Override
        public void delete(String storageKey) {
            files.remove(storageKey);
        }

        int putCount() {
            return putCount;
        }

        void clear() {
            files.clear();
            putCount = 0;
        }

        private record Stored(byte[] content, String fileName, String contentType) {}
    }
}
