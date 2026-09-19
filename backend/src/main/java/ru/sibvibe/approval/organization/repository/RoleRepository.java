package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.Role;

import java.util.List;

public interface RoleRepository extends JpaRepository<Role, Long> {
    List<Role> findByOrgIdOrderById(Long orgId);
}
