package ru.sibvibe.approval.organization.dto;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

/**
 * Ответ PUT .../roles и POST .../disable: тот же {@link MemberView} плюс returnedDocuments — сколько документов,
 * ждавших решения этого человека, вернулось авторам (приёмка 24.09, п. 15). Без числа администратор не знает,
 * задело ли его действие чей-то документ.
 */
public record MemberChangeView(@JsonUnwrapped MemberView member, int returnedDocuments) {
}
