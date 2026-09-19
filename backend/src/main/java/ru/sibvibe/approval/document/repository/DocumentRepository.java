package ru.sibvibe.approval.document.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.document.entity.Document;

public interface DocumentRepository extends JpaRepository<Document, Long> {
}
