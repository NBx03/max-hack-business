package ru.sibvibe.approval.document.service;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DocumentFileValidatorTest {

    private final DocumentFileValidator validator = new DocumentFileValidator();

    @Test
    void detectsValidPdfByContent() throws Exception {
        byte[] pdf;
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(output);
            pdf = output.toByteArray();
        }

        var result = validator.validateMain(file("renamed.bin", "text/plain", pdf));

        assertThat(result.mimeType()).isEqualTo("application/pdf");
        assertThat(result.fileName()).isEqualTo("renamed.bin");
    }

    @Test
    void detectsDocxByRequiredZipEntries() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("[Content_Types].xml"));
            zip.write("<Types/>".getBytes());
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("word/document.xml"));
            zip.write("<document/>".getBytes());
            zip.closeEntry();
        }

        var result = validator.validateMain(file("document.any", "application/octet-stream", output.toByteArray()));

        assertThat(result.mimeType())
                .isEqualTo("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    }

    @Test
    void rejectsSpoofedCorruptEmptyAndOversizedFiles() {
        assertThatThrownBy(() -> validator.validateMain(file("fake.pdf", "application/pdf", "not pdf".getBytes())))
                .isInstanceOfSatisfying(DocumentApiException.class,
                        exception -> assertThat(exception.code()).isEqualTo("FILE_TYPE_NOT_ALLOWED"));
        assertThatThrownBy(() -> validator.validateMain(file("broken.pdf", "application/pdf", "%PDF-broken".getBytes())))
                .isInstanceOf(DocumentApiException.class);
        assertThatThrownBy(() -> validator.validateMain(file("empty.pdf", "application/pdf", new byte[0])))
                .isInstanceOf(DocumentApiException.class);
        assertThatThrownBy(() -> validator.validateMain(file(
                "large.pdf", "application/pdf", new byte[(int) DocumentFileValidator.MAX_FILE_SIZE + 1])))
                .isInstanceOfSatisfying(DocumentApiException.class,
                        exception -> assertThat(exception.code()).isEqualTo("FILE_TOO_LARGE"));
    }

    @Test
    void removesClientPathFromFileName() throws Exception {
        byte[] docx;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("[Content_Types].xml"));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("word/document.xml"));
            zip.closeEntry();
        }
        docx = output.toByteArray();

        assertThat(validator.validateMain(file("C:\\fakepath\\document.docx", "ignored", docx)).fileName())
                .isEqualTo("document.docx");
    }

    @Test
    void rejectsDocxWithTooManyEntries() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("[Content_Types].xml"));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("word/document.xml"));
            zip.closeEntry();
            for (int index = 0; index < DocumentFileValidator.MAX_DOCX_ENTRIES; index++) {
                zip.putNextEntry(new ZipEntry("extra/" + index));
                zip.closeEntry();
            }
        }

        assertThatThrownBy(() -> validator.validateMain(file(
                "bomb.docx", "application/octet-stream", output.toByteArray())))
                .isInstanceOf(DocumentApiException.class)
                .hasMessageContaining("слишком много записей");
    }

    @Test
    void rejectsDocxWithExcessiveUncompressedSize() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] megabyte = new byte[1024 * 1024];
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("[Content_Types].xml"));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("word/document.xml"));
            for (int index = 0; index <= DocumentFileValidator.MAX_DOCX_UNCOMPRESSED_SIZE / megabyte.length;
                    index++) {
                zip.write(megabyte);
            }
            zip.closeEntry();
        }

        assertThatThrownBy(() -> validator.validateMain(file(
                "bomb.docx", "application/octet-stream", output.toByteArray())))
                .isInstanceOf(DocumentApiException.class)
                .hasMessageContaining("слишком большой");
    }

    private MockMultipartFile file(String name, String type, byte[] content) {
        return new MockMultipartFile("main", name, type, content);
    }
}
