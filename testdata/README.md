# Тестовые данные

Только синтетические документы: все имена, организации и реквизиты вымышлены.
ИНН начинается с кода региона 00 — такого региона нет, поэтому совпасть с настоящей
организацией он не может. Реальные документы сюда не кладём.

| Файл | Что это |
|---|---|
| `rules.json` | **Единый источник** полей и правил трёх поддержанных типов. Из него #11 делает миграцию справочника |
| `expected.json` | Для каждого документа: поля после идеального извлечения и правила, которые обязаны сработать |
| `documents/` | Сами документы, DOCX и PDF: по одному чистому и одному-двум с ошибками на тип |
| `generate.py` | Генератор документов, `expected.json` и [`docs/RULES.md`](../docs/RULES.md) |

Описание правил с источниками для людей — [`docs/RULES.md`](../docs/RULES.md).

## Как это проверяется

- `backend/src/test/java/ru/sibvibe/approval/rules/TestdataRulesTest.java` прогоняет настоящий
  `DefaultRuleEngine` по полям из `expected.json` с правилами из `rules.json` и сверяет замечания.
  Идёт в обычном `mvn test` и в CI: если правило или движок изменятся так, что данные
  перестанут совпадать, CI упадёт.
- `generate.py` перед записью файлов делает ту же проверку своей копией логики движка.

«Сегодня» для правила «дата не в будущем» — `referenceDate` из `expected.json`,
а не часы машины: тесты воспроизводимы в любой день.

## Как поменять правило или документ

1. Правьте `rules.json` (правила, поля) или список `DOCS` в `generate.py` (документы).
2. Из корня репозитория:
   ```bash
   pip install python-docx==1.2.0 reportlab==5.0.1
   python testdata/generate.py
   ```
3. Закоммитьте всё, что изменилось, включая `docs/RULES.md`: руками его не правим.

Для PDF нужен шрифт DejaVu Sans (на Windows обычно есть, на Linux — пакет `fonts-dejavu`).

## Для #11: как правила попадают в базу

- `document_type` — типы уже создаёт миграция `006-default-document-types.sql` (#17), по `code`.
- `document_type_field` — из `types[].fields`: `name` → `field_name`, `type` → `field_type`,
  `label`, `hint`.
- `requirement_rule` — из `types[].rules`: `field` → `field_name`, `check` → `check_type`,
  `expected`, `kind`, `severity`, `description`, `sourceRef` → `source_ref`; `source_title`
  и `source_url` — из `sources[source]`; `source_checked_at` — `sourceCheckedAt`.
  Код правила (`M1`, `V1`, `S1`) в базу не пишется: он нужен только документации и тестам.
