# Интеграционные тесты PostgreSQL

`DatabaseSchemaTest` и `SecurityIntegrationTest` запускаются только при заданных
`SCHEMA_TEST_URL` и `SCHEMA_TEST_PASSWORD`; обычный `mvn test` без них помечает
оба теста как skipped.

Из каталога `backend` тест можно запустить на чистом PostgreSQL 16 так:

```powershell
$env:SCHEMA_TEST_PASSWORD = [guid]::NewGuid().ToString("N")
$env:MINIO_ACCESS_KEY = "schema-test-access"
$env:MINIO_SECRET_KEY = "schema-test-secret"
docker compose -p issue14-schema -f src/test/resources/db/compose.yaml up -d --wait
$port = (docker compose -p issue14-schema -f src/test/resources/db/compose.yaml port postgres 5432).Split(":")[-1]
$env:SCHEMA_TEST_URL = "jdbc:postgresql://127.0.0.1:$port/schema_test"
mvn test
docker compose -p issue14-schema -f src/test/resources/db/compose.yaml down -v
```

# Локальная аутентификация без MAX

Запустите backend с профилем `dev` и используйте заголовок
`Authorization: Dev <положительный maxUserId>`. Например:

```powershell
mvn -Dspring-boot.run.profiles=dev spring-boot:run
curl.exe -H "Authorization: Dev 123456" http://localhost:8080/api/v1/me
```

Для демо-песочницы дополнительно задайте `DEMO_MODE=true`. Без профиля `dev`
такой заголовок всегда получает 401; настоящий `MAX_BOT_TOKEN` локально не нужен.
