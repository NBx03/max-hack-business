package ru.sibvibe.approval.document.service;

import org.apache.pdfbox.Loader;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Component
public class DocumentFileValidator {

    public static final long MAX_FILE_SIZE = 10L * 1024 * 1024;
    public static final long MAX_VERSION_SIZE = 30L * 1024 * 1024;
    public static final int MAX_ATTACHMENTS = 10;
    static final int MAX_DOCX_ENTRIES = 1_000;
    static final long MAX_DOCX_UNCOMPRESSED_SIZE = 50L * 1024 * 1024;

    private static final String PDF = "application/pdf";
    private static final String DOCX =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    public ValidatedFile validateMain(MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() <= 0) {
            throw DocumentApiException.validation("Основной файл не должен быть пустым");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw DocumentApiException.fileTooLarge("Размер файла превышает 10 МБ");
        }
        String fileName = safeFileName(file.getOriginalFilename());
        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException exception) {
            throw DocumentApiException.validation("Не удалось прочитать загруженный файл");
        }
        if (content.length == 0) {
            throw DocumentApiException.validation("Основной файл не должен быть пустым");
        }
        String mimeType = detectMainType(content);
        return new ValidatedFile(content, fileName, mimeType);
    }

    private String detectMainType(byte[] content) {
        if (isPdf(content)) {
            validatePdf(content);
            return PDF;
        }
        if (isDocx(content)) {
            return DOCX;
        }
        throw DocumentApiException.fileTypeNotAllowed("Основной файл должен быть PDF или DOCX");
    }

    private boolean isPdf(byte[] content) {
        return content.length >= 5
                && content[0] == '%'
                && content[1] == 'P'
                && content[2] == 'D'
                && content[3] == 'F'
                && content[4] == '-';
    }

    private void validatePdf(byte[] content) {
        try (var document = Loader.loadPDF(content)) {
            if (document.getNumberOfPages() < 1) {
                throw DocumentApiException.validation("PDF не содержит страниц");
            }
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof DocumentApiException apiException) {
                throw apiException;
            }
            throw DocumentApiException.validation("PDF повреждён или имеет неподдерживаемую структуру");
        }
    }

    private boolean isDocx(byte[] content) {
        if (content.length < 4 || content[0] != 'P' || content[1] != 'K') {
            return false;
        }
        Set<String> required = new HashSet<>(Set.of("[Content_Types].xml", "word/document.xml"));
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(content))) {
            ZipEntry entry;
            int entries = 0;
            long uncompressedSize = 0;
            byte[] buffer = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > MAX_DOCX_ENTRIES) {
                    throw DocumentApiException.validation("DOCX содержит слишком много записей");
                }
                required.remove(entry.getName());
                int read;
                while ((read = zip.read(buffer)) != -1) {
                    uncompressedSize += read;
                    if (uncompressedSize > MAX_DOCX_UNCOMPRESSED_SIZE) {
                        throw DocumentApiException.validation("Распакованный DOCX слишком большой");
                    }
                }
            }
            return required.isEmpty();
        } catch (IOException exception) {
            return false;
        }
    }

    private String safeFileName(String original) {
        if (original == null || original.isBlank()) {
            throw DocumentApiException.validation("У файла отсутствует имя");
        }
        String normalized = original.replace('\\', '/');
        String fileName = normalized.substring(normalized.lastIndexOf('/') + 1).trim();
        if (fileName.isBlank() || fileName.length() > 255
                || fileName.chars().anyMatch(character -> character < 32)) {
            throw DocumentApiException.validation("Некорректное имя файла");
        }
        return fileName;
    }

    public record ValidatedFile(byte[] content, String fileName, String mimeType) {
        public long size() {
            return content.length;
        }
    }
}
