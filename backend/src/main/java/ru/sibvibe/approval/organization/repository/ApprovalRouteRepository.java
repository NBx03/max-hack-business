package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.ApprovalRoute;

import java.util.List;

public interface ApprovalRouteRepository extends JpaRepository<ApprovalRoute, Long> {
    boolean existsByOrgIdAndDocumentTypeId(Long orgId, Long documentTypeId);

    List<ApprovalRoute> findByOrgIdAndDocumentTypeIdOrderByStageOrderAscIdAsc(Long orgId, Long documentTypeId);
}
