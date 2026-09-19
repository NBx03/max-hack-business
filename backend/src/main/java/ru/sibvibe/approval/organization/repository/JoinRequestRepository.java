package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.JoinRequest;

import java.util.Optional;

public interface JoinRequestRepository extends JpaRepository<JoinRequest, Long> {
    Optional<JoinRequest> findFirstByUserIdAndStatusOrderByCreatedAtDesc(
            Long userId, JoinRequest.Status status);
}
