package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.ApprovalRoute;

public interface ApprovalRouteRepository extends JpaRepository<ApprovalRoute, Long> {
}
