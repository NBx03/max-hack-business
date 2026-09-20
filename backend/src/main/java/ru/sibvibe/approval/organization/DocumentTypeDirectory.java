package ru.sibvibe.approval.organization;

import java.util.Collection;
import java.util.Map;

/**
 * Справочник типов документов для маршрутов по умолчанию.
 *
 * Интерфейс лежит в organization, а реализует его document: organization не вправе
 * вызывать document (ARCHITECTURE.md, раздел 2), поэтому зависимость обращена.
 */
public interface DocumentTypeDirectory {

    /** @return id типов по кодам; кодов, которых в базе ещё нет, в результате нет */
    Map<String, Long> idsByCode(Collection<String> codes);
}
