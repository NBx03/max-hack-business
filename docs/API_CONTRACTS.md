# Контракт REST API между мини-приложением и бэкендом

Версия 1.2 — с правками по ревью Никиты (задача #10). Внутреннее устройство бэкенда,
транзакции и конкурентность — в [ARCHITECTURE.md](ARCHITECTURE.md). Внутренний документ разработки:
собственный API в сдаче мы не заявляем (CLAUDE.md, решение C).

**Правило:** меняете эндпоинт или DTO — обновляете этот файл в том же PR. Ломающее
изменение — сообщаете в чат.

## Общее

- Базовый путь — `/api/v1`. Фронтенд обращается только к относительным путям,
  nginx проксирует на бэкенд.
- Тело — JSON в UTF-8, кроме загрузки файлов (`multipart/form-data`) и скачивания.
- Даты — ISO-8601 в UTC: `2026-09-18T13:04:05Z`. Идентификаторы — числа.
- Перечисления — латиницей в верхнем регистре, как в CLAUDE.md.
- Списки с пагинацией: `?page=0&size=20`, `size` не больше 100. Ответ:
  `{ "items": [...], "page": 0, "size": 20, "total": 57 }`.

### Заголовки

| Заголовок | Когда | Значение |
|---|---|---|
| `Authorization` | Всегда | `MaxInitData <строка window.WebApp.initData как есть>` |
| `X-Demo-Act-As` | Только в демо-режиме | id демо-пользователя, от имени которого действуем |

**Реальная компания и песочница — два независимых контекста.** Без `X-Demo-Act-As`
запрос выполняется в реальной компании пользователя, с заголовком — в его песочнице
от имени выбранного вымышленного участника. Сам проверяющий участником песочницы
не является, поэтому песочница не мешает ему создать компанию или подать заявку.

- Личность — **только** из проверенной подписи `initData`. `max_user_id` в теле
  и параметрах бэкенд игнорирует.
- `X-Demo-Act-As` принимается, только если `DEMO_MODE=true` **и** указанный участник
  из демо-песочницы **самого вызывающего**; иначе — 403 `DEMO_ACT_AS_FORBIDDEN`. На сервере «текущий
  демо-пользователь» не хранится: фронтенд передаёт заголовок в каждом запросе.
- Локальная разработка без MAX: `Authorization: Dev <maxUserId>` принимается
  **только** при профиле Spring `dev`. В сборке по умолчанию — 401.

### Ошибки

Любая ошибка **бэкенда** — одного формата. `message` — готовый текст для пользователя.
Ответ не в JSON (страница nginx при 413, 502, 504, обрыв сети) — фронтенд показывает
общий текст «Сервис временно недоступен, попробуйте ещё раз», а при 413 —
«Файл слишком большой: до 10 МБ на файл и 30 МБ на все файлы».

```json
{ "code": "ROUTE_ROLE_EMPTY", "message": "В компании нет сотрудника с ролью «Бухгалтер»", "details": { "role": "Бухгалтер" } }
```

| HTTP | Когда |
|---|---|
| 400 | Неверный ввод: `VALIDATION_FAILED`, `COMMENT_REQUIRED`, `FILE_TYPE_NOT_ALLOWED` |
| 415 | Неподдерживаемый формат тела или multipart-части: `VALIDATION_FAILED` |
| 413 | `FILE_TOO_LARGE`. Бэкенд переводит `MaxUploadSizeExceededException` в этот формат; nginx при превышении 32 МБ отвечает своей страницей 413 |
| 401 | Личность не подтверждена: `INIT_DATA_INVALID`, `INIT_DATA_EXPIRED` (данные запуска старше 24 часов — фронтенд показывает «Откройте приложение заново») |
| 403 | Нет прав: `FORBIDDEN`, `NOT_ADMIN`, `DEMO_ACT_AS_FORBIDDEN` |
| 404 | Нет такого или не видно вам: `NOT_FOUND`, `INVITE_NOT_FOUND` |
| 409 | Нельзя в текущем состоянии: `INVALID_STATE`, `STEP_NOT_ACTIVE`, `ALREADY_MEMBER`, `JOIN_REQUEST_EXISTS`, `LAST_ADMIN`, `MEMBER_HAS_PENDING_STEPS`, `ROUTE_ROLE_EMPTY`, `SELECTION_REQUIRED`, `BLOCKING_ISSUES`, `INVITE_USED`, `INVITE_EXPIRED`, `INVITE_REVOKED` |
| 429 | Слишком много попыток ввода кода: `TOO_MANY_ATTEMPTS`, `details.retryAfterSeconds` — через сколько можно снова |
| 405, 500 | `INTERNAL_ERROR` — непредвиденная ошибка; HTTP-статус исходной ошибки сохраняется |

Чужой документ отвечает **404, а не 403**: сам факт его существования не раскрываем.

### Идентификаторы от клиента

**Любой id из пути или тела ищется только в пределах того, к чему у пользователя есть доступ:**
заявка и участник — в компании администратора, файл — в текущей версии этого документа,
шаг — среди шагов этого пользователя. Не нашлось в этих пределах — 404, даже если такой
id где-то существует. Это защита от подстановки чужих id.

## Общие объекты

```ts
type UserRef   = { id: number; fullName: string };
type RoleRef   = { id: number; code: string; name: string };

type DocumentStatus = "DRAFT" | "IN_APPROVAL" | "APPROVED" | "RETURNED" | "REJECTED";
type Decision       = "PENDING" | "APPROVED" | "RETURNED" | "REJECTED" | "SKIPPED";
type Visibility     = "PRIVATE" | "ORG";   // кто видит — см. «Кто видит документ»
type Severity       = "BLOCKER" | "WARNING" | "INFO";
type RuleKind       = "LEGAL" | "INTERNAL_POLICY" | "PRODUCT_RULE";

type FileRef = {
  id: number; kind: "MAIN" | "ATTACHMENT"; fileName: string;
  mimeType: string; size: number;
  downloadUrl: string;            // подписанная ссылка на 15 минут, см. «Скачать файл»
  downloadExpiresAt: string;      // ключ хранилища наружу не отдаётся
};

type MemberView = {               // участник компании: ответ approve, PUT .../roles, PUT .../admin
  memberId: number; user: UserRef; status: "ACTIVE" | "DISABLED";
  roles: RoleRef[]; isAdmin: boolean; joinedAt: string;
};
```

### Кто видит документ

Активный участник компании документа видит его, если он:
- автор;
- или у него есть шаг согласования по этому документу — в любой версии, на любом этапе,
  в том числе ещё не начавшемся или уже решённом;
- или у документа `visibility = ORG`.

Правило одно для карточки, списков, файлов и истории. Черновик, который ни разу не
отправлялся, шагов не имеет — его видит только автор. После возврата прежние
согласующие продолжают видеть документ: они ждут исправленную версию.

## Сессия

### `GET /me` — кто я

Первый запрос мини-приложения. По нему фронтенд решает, какой экран показать.

```ts
{
  user: UserRef;                 // всегда сам пользователь, даже с X-Demo-Act-As
  membership: null | { orgId: number; orgName: string; roles: RoleRef[]; isAdmin: boolean };
                                 // только реальная компания; roles — предметные роли, права администратора — isAdmin
  pendingJoinRequest: null | { id: number; orgName: string; createdAt: string };
  demoMode: boolean;             // показывать ли «Открыть демо-компанию» и переключатель
  sandbox: null | { orgId: number; orgName: string };   // личная песочница, если создана
  actingAs: null | { user: UserRef; roles: RoleRef[]; isAdmin: boolean };
                                 // только при X-Demo-Act-As: для плашки «Демо: действую как …»
  startParam: string | null;     // из проверенной initData: c_<код>, p_<токен> или d_<id документа>
}
```

`membership = null` — это **не ошибка**, а экран приветствия. Песочница на него не влияет.

### Демо-режим

Оба эндпоинта отвечают 404, если демо-режим выключен.

| Метод и путь | Ответ |
|---|---|
| `POST /demo/sandbox` | Создаёт личную песочницу вызывающего или пересоздаёт её («Начать заново») → `{ orgId, orgName, users: [{ user: UserRef, roles: RoleRef[], isAdmin: boolean }] }` |
| `GET /demo/sandbox` | Та же песочница; 404, если ещё не создана |

`X-Demo-Act-As` принимает id из `users` своей песочницы. Сам вызывающий в `users` не входит.
«Начать заново» выдаёт новых участников: прежние id дают 403 `DEMO_ACT_AS_FORBIDDEN`,
фронтенд берёт id из ответа.

## Подключение компании

| Метод и путь | Кто | Тело → ответ |
|---|---|---|
| `POST /orgs` | Не состоит в реальной компании | `{ name, inn? }` → 201 `{ id, name }`. Создатель получает права администратора и роль «Директор»; роли и маршруты по умолчанию создаются сразу. 409 `ALREADY_MEMBER` |
| `GET /orgs/current/roles` | Участник | → `RoleRef[]` — только предметные роли |
| *SHOULD* `POST /orgs/current/roles` | ADMIN | `{ name }` → 201 `RoleRef` |
| *SHOULD* `PATCH /orgs/current/roles/{id}` | ADMIN | `{ name }` → `RoleRef` |
| `GET /orgs/current/invite-code` | ADMIN | → `{ code, link, createdAt }`, `link` = `https://max.ru/t354_hakaton_max_bot?startapp=c_<code>` |
| `POST /orgs/current/invite-code/regenerate` | ADMIN | → то же; старый код перестаёт работать |
| `GET /invites/code/{code}` | Любой | → `{ orgName }`. 404 `INVITE_NOT_FOUND`, 429 `TOO_MANY_ATTEMPTS` |
| `POST /join-requests` | Не состоит в реальной компании | `{ code }` → 201 `{ id, orgName, status, createdAt }`. 409 `ALREADY_MEMBER`, `JOIN_REQUEST_EXISTS` |
| `DELETE /join-requests/{id}` | Автор заявки | → 204. Чужая заявка — 404. Уже рассмотренная — 409 `INVALID_STATE` |
| `GET /orgs/current/join-requests?status=PENDING` | ADMIN | → `[{ id, user: UserRef, status, createdAt }]`; без `status` — только ожидающие; старые заявки первыми |
| `POST /orgs/current/join-requests/{id}/approve` | ADMIN | `{ roleIds: number[], isAdmin?: boolean }` → `MemberView`. 409 `INVALID_STATE`; 400 `VALIDATION_FAILED`, если нет ни одной роли и не выдан `isAdmin`; роль другой компании — 404 |
| `POST /orgs/current/join-requests/{id}/reject` | ADMIN | → 200 |
| `GET /orgs/current/members` | ADMIN | → `MemberView[]` |
| *SHOULD* `GET /orgs/current/roles/{id}/members` | Участник | → `UserRef[]` — активные носители роли, для добавления согласующего |
| `PUT /orgs/current/members/{memberId}/roles` | ADMIN | `{ roleIds }` → `MemberView`. 409 `MEMBER_HAS_PENDING_STEPS` (снять можно только роль без незавершённых шагов), 403 `FORBIDDEN` (свои роли менять нельзя), 409 `INVALID_STATE` (участник отключён) |
| `PUT /orgs/current/members/{memberId}/admin` | ADMIN | `{ isAdmin }` → `MemberView`. 409 `LAST_ADMIN` |
| *SHOULD* `POST /orgs/current/members/{memberId}/disable` | ADMIN | → 200 `MemberView`; повторный вызов ничего не меняет. 409 `LAST_ADMIN`, `MEMBER_HAS_PENDING_STEPS` |

Заявка, участник, роль и приглашение ищутся **в компании администратора**: чужой id — 404, в том
числе роль другой компании в `roleIds`.

**Что не видно в таблице:**
- **Кто действует.** `POST /orgs`, `POST /join-requests`, `DELETE /join-requests/{id}`,
  `GET /invites/code/{code}` и вступление по личной ссылке — действия **реального человека**:
  с `X-Demo-Act-As` они выполняются от его имени, а не от демо-участника. Остальные эндпоинты
  работают в контексте текущей компании (реальной или песочницы).
- **Код компании.** Регистр и пробелы по краям не важны. Код демо-компании принять нельзя — 404
  `INVITE_NOT_FOUND`, как и у неизвестного или перевыпущенного кода.
- **Лимит попыток.** Считаются только неверные коды на пользователя (10 в час). Исчерпав лимит, человек получает 429 `TOO_MANY_ATTEMPTS` с
  `details.retryAfterSeconds` и на `GET /invites/code/{code}`, и на `POST /join-requests` — даже
  с верным кодом, иначе перебор продолжился бы.
- **Права.** Не участник получает 403 `FORBIDDEN`, участник без прав администратора — 403 `NOT_ADMIN`.
  Права читаются из базы на каждом запросе: снятая роль или права администратора действуют сразу.
- **Собственные роли.** Администратор не меняет свои роли (403 `FORBIDDEN`): роль себе назначить
  нельзя. Исключение одно — создатель компании получает роль «Директор» при создании.
- **Роли и маршруты по умолчанию** создаются при `POST /orgs`; таблица — в ARCHITECTURE.md, раздел 5.
- **Уведомления** (заявка подана, решение по заявке, вступление по личной ссылке) — доменные
  события; отправляет их модуль бота.

### SHOULD: личные ссылки

| Метод и путь | Кто | Тело → ответ |
|---|---|---|
| `POST /orgs/current/personal-invites` | ADMIN | `{ roleIds }` → 201 `{ id, link, expiresAt, roles }`. Права администратора через ссылку не выдаются |
| `GET /orgs/current/personal-invites` | ADMIN | → неиспользованные, неотозванные и ещё не истёкшие; их видят все администраторы компании |
| `DELETE /orgs/current/personal-invites/{id}` | ADMIN | → 204; повторный отзыв ничего не меняет. Использованную ссылку отозвать нельзя — 409 `INVITE_USED` |
| `GET /invites/personal/{token}` | Любой | → `{ orgName, roles, expiresAt }`. 409 `INVITE_USED`, `INVITE_EXPIRED`, `INVITE_REVOKED` |
| `POST /invites/personal/{token}/accept` | Не состоит в реальной компании | → ответ `GET /me`. Те же 409 |

`link` = `https://max.ru/t354_hakaton_max_bot?startapp=p_<token>`. Ссылка живёт 72 часа, использовать
её можно один раз. `roleIds` обязателен и не пуст (иначе 400 `VALIDATION_FAILED`). Вступление
атомарно: из двух одновременных попыток вступает одна, вторая получает 409 `INVITE_USED`. Если
вступление не удалось (например, `ALREADY_MEMBER`), ссылка остаётся неиспользованной.

Префиксы `startParam`: `c_<код>` — код компании, `p_<токен>` — личная ссылка,
`d_<id>` — документ из уведомления бота (сразу карточка; доступ всё равно проверяет
`GET /documents/{id}`).

## Документы

### `GET /document-types`

```ts
[{ id: number; code: string; name: string; isGeneric: boolean;
   fields: { name: string; type: "STRING" | "DATE" | "NUMBER" | "PERSON" | "ORGANIZATION"; label: string; hint: string }[] }]
```

### `POST /documents` — создать документ и первую версию

`multipart/form-data`:

| Часть | Что |
|---|---|
| `meta` | JSON `{ documentTypeId, title, visibility, containsSensitive, fields?: Record<string,string> }` — принимается и без `Content-Type` у multipart-части; `containsSensitive` относится к этой версии |
| `main` | Основной файл: PDF или DOCX. Обязателен, если это не документ-форма |
| `attachments` | *SHOULD.* До 10 файлов: PDF, DOCX, XLSX, PNG, JPG |

*SHOULD, документ-форма:* тот же запрос JSON-телом с `content` вместо файлов.

Ответ 201 — `DocumentCard`. Проверка правил выполняется **в том же запросе**
и укладывается в `app.ai.timeout-seconds`; фронтенд показывает индикатор.
Документ сохраняется **до** обращения к модели: сбой или тайм-аут модели не теряет
документ, а даёт `modelAvailable = false`.

`fields` — поля, введённые вручную: при `containsSensitive = true` или когда модель
недоступна. Заголовок — до 255 символов; не более 100 полей и 10 000 символов в значении.
Ограничения файлов: 10 МБ на файл, 30 МБ на запрос, тип — по содержимому.

### `GET /documents` — списки

Параметры: `tab` (обязателен): `WAITING_ME` — есть мой активный шаг, `MINE` — я автор,
`AVAILABLE` — остальные документы, которые я вижу по правилу «Кто видит документ»; `status`, `typeId`,
`authorId`, `from`, `to` (даты создания), `page`, `size`.

```ts
type DocumentListItem = {
  id: number; title: string; type: { id: number; name: string };
  status: DocumentStatus; author: UserRef;
  currentVersionNo: number; currentStage: number | null;
  updatedAt: string;
  waitingSince: string | null;   // для WAITING_ME: activated_at моего шага
};
```

Права применяются **до** фильтров: чужое не попадает в выдачу ни при каком запросе.
Счётчики «Ждут меня» и «Заявки» на главной — `total` соответствующего списка с `size=1`.

### `GET /documents/{id}` — карточка

```ts
type DocumentCard = {
  id: number; title: string; type: { id: number; name: string; isGeneric: boolean };
  status: DocumentStatus; visibility: Visibility;
  author: UserRef; currentVersionNo: number;
  versions: { versionNo: number; containsSensitive: boolean; createdAt: string; createdBy: UserRef; files: FileRef[] }[];
  check: CheckResult | null;     // для текущей версии; null только у generic-типа
  route: RouteView | null;       // null у черновика, который ещё не отправлялся
  permissions: {                 // вычисляет бэкенд — фронтенд правила не дублирует
    canEditFields: boolean; canUploadVersion: boolean; canSubmit: boolean;
    canAddApprover: boolean;
  };
  myActiveStepIds: number[];     // шаги, по которым текущий пользователь может решить сейчас
};
```

### Скачать файл

Нативное скачивание MAX (`window.WebApp.downloadFile(url, fileName)`) не передаёт заголовок
`Authorization` и требует нажатия пользователя: запрос за ссылкой между нажатием и вызовом
может «съесть» это нажатие. Поэтому подписанная ссылка **уже лежит в карточке**:

1. `GET /documents/{id}` отдаёт в каждом `FileRef` абсолютный `downloadUrl`
   (основа — `MAX_MINI_APP_URL`; локально, если он пуст, — относительный путь)
   и `downloadExpiresAt`.
2. По нажатию фронтенд сразу вызывает `window.WebApp.downloadFile(downloadUrl, fileName)`
   (вне MAX — `window.open`). Ссылка истекла — перезапросить карточку и попросить
   нажать ещё раз. Проверить на устройстве, засчитывается ли нажатие (задача #6).
3. `GET /files/{fileId}/content?token=…` — **без** `Authorization`, поток с
   `Content-Disposition: attachment`. Токен — подпись HMAC от `fileId`, пользователя и срока.
   **Права проверяются заново при скачивании**: снятая роль действует сразу (CLAUDE.md,
   проверка №8). Чужой, просроченный, испорченный токен или нет прав — 404.
4. Ключ подписи — `DOWNLOAD_LINK_SECRET`; если не задан, бэкенд генерирует случайный
   при запуске. Пустой `.env` не ломает старт, после перезапуска старые ссылки
   перестают работать — фронтенд просто перезапросит карточку.

### `POST /documents/{id}/versions` — новая версия

Можно в `DRAFT` и `RETURNED`, иначе 409 `INVALID_STATE`. Из `RETURNED` документ
переходит в `DRAFT`: автор видит проверку новой версии и отправляет заново.
`multipart/form-data`: `meta` = `{ fields?, containsSensitive, keepFileIds: number[] }`
(JSON принимается и без `Content-Type` у части),
плюс `main` и `attachments` — только то, что меняется.

- Файлы из `keepFileIds` переиспользуются без повторной загрузки.
- **Каждый id из `keepFileIds` обязан быть файлом текущей версии этого документа.**
  Любой другой — 400 `VALIDATION_FAILED` без уточнения, чей это файл.
- Без нового основного файла в `main` основной файл должен быть в `keepFileIds`.

Ответ — `DocumentCard`.

### `PUT /documents/{id}/versions/{versionNo}/fields` — поправить поля

`{ fields: Record<string,string> }` → `CheckResult`. Правила проверяются заново.
Только для текущей версии в `DRAFT`. Возвращённая версия не редактируется —
она уже в истории; исправление — новая версия.

### Результат проверки

```ts
type CheckResult = {
  versionNo: number;
  status: "CHECKED" | "FAILED";  // FAILED — проверка не выполнилась: «Проверка не выполнена»,
                                 // повтор — сохранить поля ещё раз; отправка недоступна
  modelAvailable: boolean;       // false — показать «Разбор моделью недоступен, заполните поля вручную»
  fields: { name: string; value: string | null; source: "MODEL" | "MANUAL"; quote: string | null; page: number | null }[];
  issues: ValidationIssue[];     // пустой список — «замечаний нет»
};

type ValidationIssue = {         // как RuleEngine.ValidationIssue
  ruleId: number; fieldName: string; message: string;
  severity: Severity; kind: RuleKind;
  sourceTitle: string; sourceUrl: string | null; sourceRef: string | null;
  quote: string | null; page: number | null;
};
```

## Маршрут и решения

### `GET /documents/{id}/route-preview` — предпросмотр перед отправкой

```ts
{
  stages: {
    stageOrder: number;
    participants: {
      role: RoleRef; mandatory: boolean;
      candidates: UserRef[];         // автор исключён
      selectedUserId: number | null; // проставлен, если кандидат один
      resolution: "SELECT" | "AUTO" | "SKIPPED" | "AUTHOR_HOLDS_ROLE";
      // SELECT — выбрать из кандидатов; AUTO — кандидат один; SKIPPED — необязательный
      // участник без кандидатов; AUTHOR_HOLDS_ROLE — обязательный, но роль есть
      // только у автора: шаг будет сразу согласован с отметкой в истории
    }[];
  }[];
  problems: { code: "ROUTE_ROLE_EMPTY" | "BLOCKING_ISSUES"; message: string }[];
}
```

`problems` не пуст — кнопка «Отправить» неактивна, текст показывается пользователю.

Доступен **автору черновика**. Человек без компании получает 403 на любой id (существует документ или нет — не
раскрывается); документ другой компании или невидимый человеку — 404; тот, кто видит, но не автор, — 403;
не черновик — 409 `INVALID_STATE`. Предпросмотр не создаёт шагов согласования и не меняет документ и показывает ровно то, что сделает
отправка. Единственное, что он может записать, — шаблон маршрута компании: если для типа документа
маршрута ещё нет, он создаётся по умолчанию при первом обращении (при отправке — так же).

### `POST /documents/{id}/submit` — отправить

```ts
{
  selections: { stageOrder: number; roleId: number; userId: number }[];  // где кандидатов несколько
  extraApprovers?: { stageOrder: number; roleId: number; userId: number }[];  // SHOULD
}
```

Ответ — `DocumentCard`. 409: `INVALID_STATE`, `ROUTE_ROLE_EMPTY`,
`SELECTION_REQUIRED`, `BLOCKING_ISSUES`. Тело можно не передавать, если выбирать не из чего.

- **`selections`** нужны там, где кандидатов несколько (`resolution = SELECT`); там, где выбор не нужен, или дважды
  для одной роли — 400 `VALIDATION_FAILED`. Пара «этап + роль» вне маршрута или человек не из кандидатов — 404.
  Не выбран человек там, где нужно, — 409 `SELECTION_REQUIRED`.
- **`extraApprovers`** (SHOULD): этап должен быть в шаблоне, роль — из этой компании, человек — её активный носитель и
  не автор (404 иначе). 400 `VALIDATION_FAILED` — для автора и для дубля: того же человека в той же роли на том же
  этапе, будь он добавлен дважды, подставлен автоматически или выбран в `selections`. Маршрут только растёт: убрать
  участника шаблона нельзя, а «добавить» уже стоящего — значит не добавить никого.
- **Нельзя отправить** (`BLOCKING_ISSUES`), если у типа с проверкой она не выполнилась (`check_status ≠ CHECKED`) или
  есть замечание `BLOCKER`; та же логика определяет `permissions.canSubmit`.
- Если решать некому (обязательные роли только у автора, остальное пропущено), документ становится «Согласован» сразу,
  а шаг автора в истории подписан «согласовано автором как <роль>».
- `permissions.canAddApprover` — `true` у автора черновика.

Добавленный согласующий (SHOULD) согласует **в роли**: он должен быть её активным носителем
(`GET /orgs/current/roles/{id}/members`) и не автором. Поэтому у каждого шага есть роль.

### Маршрут на карточке

```ts
type RouteView = {
  versionNo: number;
  stages: { stageOrder: number; state: "WAITING" | "ACTIVE" | "DONE"; steps: StepView[] }[];
  history: StepView[];           // шаги прошлых версий — только чтение
};

type StepView = {
  id: number; versionNo: number; stageOrder: number;
  role: RoleRef; approver: UserRef;
  origin: "TEMPLATE" | "ADDED_BY_AUTHOR";
  decision: Decision; comment: string | null;
  activatedAt: string | null;    // когда этап шага стал активным; null — этап ещё не начался
  decidedAt: string | null;      // у AUTHOR_HOLDS_ROLE — момент отправки
  autoReason: "AUTHOR_HOLDS_ROLE" | null;  // показывать «согласовано автором как <роль>»
};
```

### `POST /approval-steps/{stepId}/decision` — решение согласующего

`{ decision: "APPROVE" | "RETURN" | "REJECT", comment?: string }` → `DocumentCard`.

Решение адресуется **шагу**, а не документу: человек с двумя ролями одного этапа
имеет два шага и решает по каждому. Номера шагов — в `myActiveStepIds` карточки.

- 400 `COMMENT_REQUIRED` — возврат или отклонение без комментария. Пробелы по краям обрезаются до проверки:
  строка из одних пробелов — это отсутствие комментария.
- 400 `VALIDATION_FAILED` — комментарий длиннее 2000 символов **после** обрезки пробелов.
- 403 `FORBIDDEN` — человек без компании.
- 404 — шаг не найден среди шагов пользователя.
- 409 `STEP_NOT_ACTIVE` — шаг уже закрыт или его этап не активен, например документ
  только что вернул другой согласующий (текст ответа: «Документ уже возвращён» или «Документ уже отклонён»).
- Этап закрывается, когда одобрены все его шаги (`mandatory` в предпросмотре влияет только на то, пропускается ли
  участник без носителей, а не на закрытие этапа). «Вернуть» и «отклонить» закрывают документ сразу: остальные
  ожидающие шаги версии получают `SKIPPED`.
- **Повтор того же решения тем же пользователем** — 200 с текущей карточкой, без
  изменений. Двойной клик безопасен.

## SHOULD: показатели эффекта

`GET /orgs/current/metrics?from=&to=` →
`{ medianApprovalHours: number | null; returnRate: number | null; documentsCount: number }`.

## Документация API

`springdoc` генерирует OpenAPI по коду. Перед сдачей выгружаем её в `docs/openapi.yaml`
как документацию внутреннего API — собственный API в сдаче при этом не заявляем
(CLAUDE.md, решение C), `DATA-API.yaml` не готовим.

## Не для фронтенда

`POST /bot/webhook` — события Bot API на стенде. Способ проверки подлинности входящих
запросов сверить с dev.max.ru до включения webhook.
