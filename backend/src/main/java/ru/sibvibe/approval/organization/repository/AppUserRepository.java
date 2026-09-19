package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.AppUser;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {
}
