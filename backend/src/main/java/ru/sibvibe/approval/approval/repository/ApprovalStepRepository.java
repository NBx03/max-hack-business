package ru.sibvibe.approval.approval.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.approval.entity.ApprovalStep;

public interface ApprovalStepRepository extends JpaRepository<ApprovalStep, Long> {
}
