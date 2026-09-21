package ru.sibvibe.approval.approval.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import ru.sibvibe.approval.approval.entity.ApprovalStep;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ApprovalStepRepository extends JpaRepository<ApprovalStep, Long> {
    boolean existsByApproverIdAndDecision(Long approverId, ApprovalStep.Decision decision);

    boolean existsByApproverIdAndRoleIdInAndDecision(
            Long approverId, Collection<Long> roleIds, ApprovalStep.Decision decision);

    /**
     * Документ шага, если шаг принадлежит этому пользователю. Возвращается число, а не сущность: до блокировки
     * документа строку шага читать нельзя, иначе кэш сессии сохранит устаревшее состояние, пока мы ждали очередь.
     */
    @Query("select s.documentId from ApprovalStep s where s.id = :stepId and s.approverId = :approverId")
    Optional<Long> findDocumentIdOfStep(Long stepId, Long approverId);

    List<ApprovalStep> findByDocumentIdAndVersionNoOrderByStageOrderAscIdAsc(Long documentId, Integer versionNo);
}
