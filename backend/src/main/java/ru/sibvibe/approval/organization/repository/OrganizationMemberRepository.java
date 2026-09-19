package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.OrganizationMember;

import java.util.List;
import java.util.Optional;

public interface OrganizationMemberRepository extends JpaRepository<OrganizationMember, Long> {
    Optional<OrganizationMember> findFirstByUserIdAndStatusAndDemoFalse(
            Long userId, OrganizationMember.Status status);

    Optional<OrganizationMember> findByOrgIdAndUserIdAndStatusAndDemoTrue(
            Long orgId, Long userId, OrganizationMember.Status status);

    List<OrganizationMember> findByOrgIdAndStatusAndDemoTrueOrderById(
            Long orgId, OrganizationMember.Status status);
}
