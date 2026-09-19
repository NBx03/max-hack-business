# Проверка схемы PostgreSQL

`DatabaseSchemaTest` запускается только при заданных `SCHEMA_TEST_URL` и
`SCHEMA_TEST_PASSWORD`; обычный `mvn test` без них помечает тест как skipped.

Из каталога `backend` тест можно запустить на чистом PostgreSQL 16 так:

```powershell
$env:SCHEMA_TEST_PASSWORD = [guid]::NewGuid().ToString("N")
docker compose -p issue14-schema -f src/test/resources/db/compose.yaml up -d --wait
$port = (docker compose -p issue14-schema -f src/test/resources/db/compose.yaml port postgres 5432).Split(":")[-1]
$env:SCHEMA_TEST_URL = "jdbc:postgresql://127.0.0.1:$port/schema_test"
mvn -Dtest=DatabaseSchemaTest test
docker compose -p issue14-schema -f src/test/resources/db/compose.yaml down -v
```
