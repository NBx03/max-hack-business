package ru.sibvibe.approval.organization.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.organization.entity.Invite;

public interface InviteRepository extends JpaRepository<Invite, Long> {
}
