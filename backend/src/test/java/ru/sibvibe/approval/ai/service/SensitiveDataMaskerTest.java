package ru.sibvibe.approval.ai.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SensitiveDataMaskerTest {

    private final SensitiveDataMasker masker = new SensitiveDataMasker();

    @Test
    void masksNamedValuesAndRestoresOriginalText() {
        String source = "Иванов И.И., ИНН 1234567890, СНИЛС 123-456-789 01, "
                + "паспорт 1234 567890, телефон +7 (913) 123-45-67";

        SensitiveDataMasker.MaskedText masked = masker.mask(source);

        assertThat(masked.text())
                .contains("<PERSON_1>", "<INN_1>", "<SNILS_1>", "<PASSPORT_1>", "<PHONE_1>")
                .doesNotContain("1234567890", "123-456-789 01", "1234 567890", "+7 (913) 123-45-67");
        assertThat(masked.restore(masked.text())).isEqualTo(source);
    }

    @Test
    void usesStableIndexesForRepeatedValues() {
        SensitiveDataMasker.MaskedText masked = masker.mask("ИНН 1234567890, ИНН 0987654321");

        assertThat(masked.text()).contains("<INN_1>", "<INN_2>");
        assertThat(masked.restore(masked.text())).isEqualTo("ИНН 1234567890, ИНН 0987654321");
    }
}
