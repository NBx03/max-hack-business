package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.JoinRequest;

public interface JoinRequestRepository extends JpaRepository<JoinRequest, Long> {
}
