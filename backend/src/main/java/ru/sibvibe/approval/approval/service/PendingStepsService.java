package ru.sibvibe.approval.approval.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.approval.entity.ApprovalStep;
import ru.sibvibe.approval.approval.repository.ApprovalStepRepository;
import ru.sibvibe.approval.organization.PendingStepsGuard;

import java.util.Collection;

/** Отвечает organization, ждут ли решения от человека: без этого документ мог бы зависнуть. */
@Service
public class PendingStepsService implements PendingStepsGuard {

    private final ApprovalStepRepository stepRepository;

    public PendingStepsService(ApprovalStepRepository stepRepository) {
        this.stepRepository = stepRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean hasPendingSteps(long userId) {
        return stepRepository.existsByApproverIdAndDecision(userId, ApprovalStep.Decision.PENDING);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean hasPendingSteps(long userId, Collection<Long> roleIds) {
        if (roleIds.isEmpty()) {
            return false;
        }
        return stepRepository.existsByApproverIdAndRoleIdInAndDecision(
                userId, roleIds, ApprovalStep.Decision.PENDING);
    }
}
