# Контракт REST API между мини-приложением и бэкендом

Версия 1 — черновик для согласования (задача #10). Внутренний документ разработки:
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

- Личность — **только** из проверенной подписи `initData`. `max_user_id` в теле
  и параметрах бэкенд игнорирует.
- `X-Demo-Act-As` принимается, только если `DEMO_MODE=true` **и** пользователь
  из демо-компании; иначе — 403 `DEMO_ACT_AS_FORBIDDEN`. На сервере «текущий
  демо-пользователь» не хранится: фронтенд передаёт заголовок в каждом запросе.
- Локальная разработка без MAX: `Authorization: Dev <maxUserId>` принимается
  **только** при профиле Spring `dev`. В сборке по умолчанию — 401.

### Ошибки

Любая ошибка — одного формата. `message` — готовый текст для пользователя.

```json
{ "code": "ROUTE_ROLE_EMPTY", "message": "В компании нет сотрудника с ролью «Бухгалтер»", "details": { "role": "Бухгалтер" } }
```

| HTTP | Когда |
|---|---|
| 400 | Неверный ввод: `VALIDATION_FAILED`, `COMMENT_REQUIRED`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE` |
| 401 | Личность не подтверждена: `INIT_DATA_INVALID`, `INIT_DATA_EXPIRED` |
| 403 | Нет прав: `FORBIDDEN`, `NOT_ADMIN`, `NOT_YOUR_STEP`, `DEMO_ACT_AS_FORBIDDEN` |
| 404 | Нет такого или не видно вам: `NOT_FOUND`, `INVITE_NOT_FOUND` |
| 409 | Нельзя в текущем состоянии: `INVALID_STATE`, `ALREADY_MEMBER`, `JOIN_REQUEST_EXISTS`, `LAST_ADMIN`, `MEMBER_HAS_PENDING_STEPS`, `ROUTE_ROLE_EMPTY`, `SELECTION_REQUIRED`, `BLOCKING_ISSUES`, `INVITE_USED`, `INVITE_EXPIRED`, `INVITE_REVOKED` |
| 429 | Слишком много попыток ввода кода: `TOO_MANY_ATTEMPTS` |

Чужой документ отвечает **404, а не 403**: сам факт его существования не раскрываем.

## Общие объекты

```ts
type UserRef   = { id: number; fullName: string };
type RoleRef   = { id: number; code: string; name: string };

type DocumentStatus = "DRAFT" | "IN_APPROVAL" | "APPROVED" | "RETURNED" | "REJECTED";
type Decision       = "PENDING" | "APPROVED" | "RETURNED" | "REJECTED" | "SKIPPED";
type Visibility     = "PRIVATE" | "ORG";   // PRIVATE — автор и участники маршрута
type Severity       = "BLOCKER" | "WARNING" | "INFO";
type RuleKind       = "LEGAL" | "INTERNAL_POLICY" | "PRODUCT_RULE";

type FileRef = {
  id: number; kind: "MAIN" | "ATTACHMENT"; fileName: string;
  mimeType: string; size: number;
  downloadUrl: string;            // "/api/v1/files/{id}" — ключ хранилища наружу не отдаётся
};
```

## Сессия

### `GET /me` — кто я

Первый запрос мини-приложения. По нему фронтенд решает, какой экран показать.

```ts
{
  user: UserRef;
  membership: null | { orgId: number; orgName: string; isDemo: boolean; roles: RoleRef[]; isAdmin: boolean };
  pendingJoinRequest: null | { id: number; orgName: string; createdAt: string };
  demoMode: boolean;             // показывать ли «Открыть демо-компанию» и переключатель
  startParam: string | null;     // из проверенной initData: код компании или токен личной ссылки
}
```

`membership = null` — это **не ошибка**, а экран приветствия.

### `GET /demo/users` — демо-участники

404, если демо-режим выключен. Ответ: `[{ user: UserRef, roles: RoleRef[] }]`.

## Подключение компании

| Метод и путь | Кто | Тело → ответ |
|---|---|---|
| `POST /orgs` | Не состоит в компании | `{ name, inn? }` → 201 `{ id, name }`. Создатель — ADMIN, роли и маршруты по умолчанию создаются сразу. 409 `ALREADY_MEMBER` |
| `GET /orgs/current/roles` | Участник | → `RoleRef[]` |
| `GET /orgs/current/invite-code` | ADMIN | → `{ code, link, createdAt }`, `link` = `https://max.ru/t354_hakaton_max_bot?startapp=c_<code>` |
| `POST /orgs/current/invite-code/regenerate` | ADMIN | → то же; старый код перестаёт работать |
| `GET /invites/code/{code}` | Любой | → `{ orgName }`. 404 `INVITE_NOT_FOUND`, 429 `TOO_MANY_ATTEMPTS` |
| `POST /join-requests` | Не состоит в компании | `{ code }` → 201 `{ id, orgName, status, createdAt }`. 409 `ALREADY_MEMBER`, `JOIN_REQUEST_EXISTS` |
| `DELETE /join-requests/{id}` | Автор заявки | → 204 |
| `GET /orgs/current/join-requests?status=PENDING` | ADMIN | → `[{ id, user: UserRef, status, createdAt }]` |
| `POST /orgs/current/join-requests/{id}/approve` | ADMIN | `{ roleIds: number[] }` → участник. 409 `INVALID_STATE` |
| `POST /orgs/current/join-requests/{id}/reject` | ADMIN | → 200 |
| `GET /orgs/current/members` | ADMIN | → `[{ memberId, user: UserRef, status, roles: RoleRef[], joinedAt }]` |
| `PUT /orgs/current/members/{memberId}/roles` | ADMIN | `{ roleIds }` → участник. 409 `LAST_ADMIN`, `MEMBER_HAS_PENDING_STEPS` |
| *SHOULD* `POST /orgs/current/members/{memberId}/disable` | ADMIN | → 200. 409 `LAST_ADMIN`, `MEMBER_HAS_PENDING_STEPS` |

Заявка и участник ищутся **в компании администратора**: чужой id — 404.

### SHOULD: личные ссылки

| Метод и путь | Кто | Тело → ответ |
|---|---|---|
| `POST /orgs/current/personal-invites` | ADMIN | `{ roleIds }` → 201 `{ id, link, expiresAt, roles }`. Роль ADMIN — 400 |
| `GET /orgs/current/personal-invites` | ADMIN | → неиспользованные и неотозванные |
| `DELETE /orgs/current/personal-invites/{id}` | ADMIN | → 204 |
| `GET /invites/personal/{token}` | Любой | → `{ orgName, roles, expiresAt }`. 409 `INVITE_USED`, `INVITE_EXPIRED`, `INVITE_REVOKED` |
| `POST /invites/personal/{token}/accept` | Не состоит в компании | → ответ `GET /me`. Те же 409 |

`link` = `https://max.ru/t354_hakaton_max_bot?startapp=p_<token>`. Префиксы `c_` и `p_`
отличают код компании от личной ссылки в `startParam`.

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
| `meta` | JSON `{ documentTypeId, title, visibility, containsSensitive, fields?: Record<string,string> }` |
| `main` | Основной файл: PDF или DOCX. Обязателен, если это не документ-форма |
| `attachments` | *SHOULD.* До 10 файлов: PDF, DOCX, XLSX, PNG, JPG |

*SHOULD, документ-форма:* тот же запрос JSON-телом с `content` вместо файлов.

Ответ 201 — `DocumentCard`. Проверка правил выполняется **в том же запросе**
и укладывается в `app.ai.timeout-seconds`; фронтенд показывает индикатор.

`fields` — поля, введённые вручную: при `containsSensitive = true` или когда модель
недоступна. Ограничения: 10 МБ на файл, 30 МБ на запрос, тип — по содержимому.

### `GET /documents` — списки

Параметры: `tab = WAITING_ME | MINE | AVAILABLE` (обязателен), `status`, `typeId`,
`authorId`, `from`, `to` (даты создания), `page`, `size`.

```ts
type DocumentListItem = {
  id: number; title: string; type: { id: number; name: string };
  status: DocumentStatus; author: UserRef;
  currentVersionNo: number; currentStage: number | null;
  updatedAt: string;
  waitingSince: string | null;   // для WAITING_ME: когда шаг стал активным
};
```

Права применяются **до** фильтров: чужое не попадает в выдачу ни при каком запросе.

### `GET /documents/{id}` — карточка

```ts
type DocumentCard = {
  id: number; title: string; type: { id: number; name: string; isGeneric: boolean };
  status: DocumentStatus; visibility: Visibility; containsSensitive: boolean;
  author: UserRef; currentVersionNo: number;
  versions: { versionNo: number; createdAt: string; createdBy: UserRef; files: FileRef[] }[];
  check: CheckResult | null;     // для текущей версии; null у generic-типа
  route: RouteView | null;       // null у черновика, который ещё не отправлялся
  permissions: {                 // вычисляет бэкенд — фронтенд правила не дублирует
    canEditFields: boolean; canUploadVersion: boolean; canSubmit: boolean;
    canDecide: boolean; canAddApprover: boolean;
  };
};
```

### `GET /files/{fileId}` — скачать файл

Поток с `Content-Disposition: attachment`. Права проверяются как для документа.

### `POST /documents/{id}/versions` — новая версия

Можно в `DRAFT` и `RETURNED`, иначе 409 `INVALID_STATE`. `multipart/form-data`:
`meta` = `{ fields?, keepFileIds: number[] }`, плюс `main` и `attachments` — только
то, что меняется. Файлы из `keepFileIds` переиспользуются без повторной загрузки.
Ответ — `DocumentCard`.

### `PUT /documents/{id}/versions/{versionNo}/fields` — поправить поля

`{ fields: Record<string,string> }` → `CheckResult`. Правила проверяются заново.
Только для текущей версии в `DRAFT` или `RETURNED`.

### Результат проверки

```ts
type CheckResult = {
  versionNo: number;
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
    }[];
  }[];
  problems: { code: "ROUTE_ROLE_EMPTY" | "BLOCKING_ISSUES"; message: string }[];
}
```

`problems` не пуст — кнопка «Отправить» неактивна, текст показывается пользователю.

### `POST /documents/{id}/submit` — отправить

```ts
{
  selections: { stageOrder: number; roleId: number; userId: number }[];  // где кандидатов несколько
  extraApprovers?: { stageOrder: number; userId: number }[];             // SHOULD
}
```

Ответ — `DocumentCard`. 409: `INVALID_STATE`, `ROUTE_ROLE_EMPTY`,
`SELECTION_REQUIRED`, `BLOCKING_ISSUES`.

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
  decision: Decision; comment: string | null; decidedAt: string | null;
};
```

### `POST /documents/{id}/decisions` — решение согласующего

`{ decision: "APPROVE" | "RETURN" | "REJECT", comment?: string }` → `DocumentCard`.

- 400 `COMMENT_REQUIRED` — возврат или отклонение без комментария.
- 403 `NOT_YOUR_STEP` — у пользователя нет активного шага в этом документе.
- 409 `INVALID_STATE` — документ не на согласовании.

## SHOULD: показатели эффекта

`GET /orgs/current/metrics?from=&to=` →
`{ medianApprovalHours: number | null; returnRate: number | null; documentsCount: number }`.

## Не для фронтенда

`POST /bot/webhook` — события Bot API на стенде. Способ проверки подлинности входящих
запросов сверить с dev.max.ru до включения webhook.
