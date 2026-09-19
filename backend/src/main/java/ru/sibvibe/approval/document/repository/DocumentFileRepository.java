package ru.sibvibe.approval.document.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.document.entity.DocumentFile;

public interface DocumentFileRepository extends JpaRepository<DocumentFile, Long> {
}
