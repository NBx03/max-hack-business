package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.MemberRole;

import java.util.List;

public interface MemberRoleRepository extends JpaRepository<MemberRole, MemberRole.Key> {
    List<MemberRole> findByMemberId(Long memberId);
}
