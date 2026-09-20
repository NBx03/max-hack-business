package ru.sibvibe.approval.organization.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import ru.sibvibe.approval.organization.entity.Organization;

import java.util.Optional;

public interface OrganizationRepository extends JpaRepository<Organization, Long> {
    Optional<Organization> findFirstByDemoOwnerIdAndDemoTrueOrderByIdDesc(Long demoOwnerId);

    /** Блокировка строки компании: сериализует смену администраторов и перевыпуск кода. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Organization o where o.id = :id")
    Optional<Organization> findByIdForUpdate(Long id);
}
