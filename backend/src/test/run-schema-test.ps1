# Запускать из любого каталога; существующие БД и Compose-проекты не затрагиваются.
$ErrorActionPreference = 'Stop'
$schemaCompose = Join-Path $PSScriptRoot 'resources/db/compose.yaml'
$schemaBackend = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$schemaProject = 'issue14-schema-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$previousPassword = $env:SCHEMA_TEST_PASSWORD
$previousUrl = $env:SCHEMA_TEST_URL
$schemaExitCode = 1
$env:SCHEMA_TEST_PASSWORD = [Guid]::NewGuid().ToString('N')
Push-Location $schemaBackend
try {
    docker compose -p $schemaProject -f $schemaCompose up -d --wait
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось запустить тестовый PostgreSQL' }
    $schemaAddress = docker compose -p $schemaProject -f $schemaCompose port postgres 5432
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось определить порт PostgreSQL' }
    $env:SCHEMA_TEST_URL = 'jdbc:postgresql://' + $schemaAddress.Trim() + '/schema_test'
    mvn test
    $schemaExitCode = $LASTEXITCODE
} finally {
    docker compose -p $schemaProject -f $schemaCompose down
    if ($LASTEXITCODE -ne 0) { $schemaExitCode = 1 }
    $env:SCHEMA_TEST_PASSWORD = $previousPassword
    $env:SCHEMA_TEST_URL = $previousUrl
    Pop-Location
}
exit $schemaExitCode
