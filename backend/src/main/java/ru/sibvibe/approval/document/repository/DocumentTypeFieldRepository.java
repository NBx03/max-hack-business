package ru.sibvibe.approval.document.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.document.entity.DocumentTypeField;

public interface DocumentTypeFieldRepository extends JpaRepository<DocumentTypeField, Long> {
}
