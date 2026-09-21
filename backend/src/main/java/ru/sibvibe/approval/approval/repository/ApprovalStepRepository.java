package ru.sibvibe.approval.approval.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.approval.entity.ApprovalStep;

import java.util.Collection;

public interface ApprovalStepRepository extends JpaRepository<ApprovalStep, Long> {
    boolean existsByApproverIdAndDecision(Long approverId, ApprovalStep.Decision decision);

    boolean existsByApproverIdAndRoleIdInAndDecision(
            Long approverId, Collection<Long> roleIds, ApprovalStep.Decision decision);
}
