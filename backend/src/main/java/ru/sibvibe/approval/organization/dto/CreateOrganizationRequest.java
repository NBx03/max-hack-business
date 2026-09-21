package ru.sibvibe.approval.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** ИНН необязательный и не проверяется: по контракту это только справочное поле. */
public record CreateOrganizationRequest(
        @NotBlank @Size(max = 255) String name,
        @Size(max = 255) String inn
) {
}
