package ru.sibvibe.approval.rules.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.sibvibe.approval.rules.entity.RequirementRule;

public interface RequirementRuleRepository extends JpaRepository<RequirementRule, Long> {
}
