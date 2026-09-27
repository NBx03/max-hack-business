package ru.sibvibe.approval.organization;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;

/**
 * Справочник типов документов для маршрутов по умолчанию.
 *
 * Интерфейс лежит в organization, а реализует его document: organization не вправе
 * вызывать document (ARCHITECTURE.md, раздел 2), поэтому зависимость обращена.
 */
public interface DocumentTypeDirectory {

    /** @return id типов по кодам; кодов, которых в базе ещё нет, в результате нет */
    Map<String, Long> idsByCode(Collection<String> codes);

    /** Тип по id — для проверки, что документ такого типа существует и «Другой документ» ли он (#98). */
    Optional<TypeInfo> find(long id);

    record TypeInfo(long id, String code, boolean generic) {
    }
}
