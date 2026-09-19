# Как мы работаем

Только базовые правила. Архитектура — в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Git

- В `main` напрямую не пушим — только через pull request.
- Ветка на задачу: `feature/<номер>-<кратко>`, например `feature/14-db-schema`.
- **Заголовок PR:** `тип(область): описание (#задача)`, например
  `feat(auth): проверка подписи initData (#4)`. Типы: `feat`, `fix`, `test`, `refactor`,
  `docs`, `build`, `ci`, `chore`. Формат проверяет робот.
- Описание PR — по желанию, хватит одной строки. Коммиты внутри ветки — как удобно:
  в `main` они сольются в один коммит с заголовком PR.
- Сливаем, когда проверки зелёные и есть одно одобрение. Ревьюер назначается сам:
  бэкенд — Илья и Никита друг у друга (или Булат), фронтенд — Булат или Никита,
  зависимости, Docker и документы — Булат.

## Код

- Имена — латиницей, комментарии и тексты для пользователя — по-русски.
- Бэкенд: `controller → service → repository`, наружу только DTO, проверка прав в сервисе.
  Раскладка модулей — ARCHITECTURE.md.
- Фронтенд: сначала компоненты `@maxhub/max-ui`, запросы только на относительный `/api/...`,
  у экрана с данными есть загрузка и ошибка.
- Меняете эндпоинт или DTO — поправьте `docs/API_CONTRACTS.md` в том же PR.
- Новая зависимость — только с замером `docker compose build --no-cache`: лимит кейса 300 с.
- Секреты — только в локальном `.env`. Токен бота передаём только в личке.

## Бэкенд вне Docker и сертификат Минцифры

Bot API (`platform-api2.max.ru`) и GigaChat работают на сертификате Минцифры. В Docker-образе
он уже есть. Если запускаете бэкенд **из IDE на своей Java**, один раз добавьте корень в её
хранилище — команда из корня репозитория (Windows: терминал от имени администратора):

```bash
keytool -importcert -noprompt -cacerts -storepass changeit -alias russian-trusted-root-ca -file backend/certs/russian_trusted_root_ca.pem
```

Проверка: `keytool -list -cacerts -storepass changeit -alias russian-trusted-root-ca`.
Ставить сертификат в Windows или браузер не нужно — мини-приложение к этим адресам не обращается.

## Локальная аутентификация без MAX

Запустите backend с профилем `dev` и используйте заголовок
`Authorization: Dev <положительный maxUserId>`. Например:

```powershell
mvn -Dspring-boot.run.profiles=dev spring-boot:run
curl.exe -H "Authorization: Dev 123456" http://localhost:8080/api/v1/me
```

Для демо-песочницы дополнительно задайте `DEMO_MODE=true`. Без профиля `dev`
такой заголовок всегда получает 401; настоящий `MAX_BOT_TOKEN` локально не нужен.
