package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.InviteRole;

public interface InviteRoleRepository extends JpaRepository<InviteRole, InviteRole.Key> {
}
