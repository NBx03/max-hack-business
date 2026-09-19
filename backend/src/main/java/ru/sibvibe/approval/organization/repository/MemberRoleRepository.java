package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.MemberRole;

public interface MemberRoleRepository extends JpaRepository<MemberRole, MemberRole.Key> {
}
