package ru.sibvibe.approval.document.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.document.dto.OrganizationMetricsResponse;
import ru.sibvibe.approval.document.repository.DocumentReadRepository;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

@Service
public class DocumentMetricsService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Moscow");

    private final DocumentReadRepository repository;

    public DocumentMetricsService(DocumentReadRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public OrganizationMetricsResponse metrics(CurrentUser user, LocalDate from, LocalDate to) {
        if (user.orgId() == null || user.memberId() == null) {
            throw DocumentApiException.forbidden("Для просмотра показателей нужно состоять в компании");
        }
        if (from != null && to != null && from.isAfter(to)) {
            throw DocumentApiException.validation("Дата начала периода не может быть позже даты окончания");
        }

        Instant fromInstant = from == null ? null : from.atStartOfDay(BUSINESS_ZONE).toInstant();
        Instant toExclusive = to == null ? null : to.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();
        DocumentReadRepository.MetricsRow row = repository.metrics(user.orgId(), fromInstant, toExclusive);
        return new OrganizationMetricsResponse(
                row.medianApprovalHours(), row.returnRate(), row.documentsCount());
    }
}
