package ru.sibvibe.approval.document.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.document.entity.DocumentType;

public interface DocumentTypeRepository extends JpaRepository<DocumentType, Long> {
}
