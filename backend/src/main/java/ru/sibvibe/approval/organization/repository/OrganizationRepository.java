package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.Organization;

public interface OrganizationRepository extends JpaRepository<Organization, Long> {
}
