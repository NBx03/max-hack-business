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
| 409 | Нельзя в текущем состоянии: `INVALID_STATE`, `STEP_NOT_ACTIVE`, `ALREADY_MEMBER`, `JOIN_REQUEST_EXISTS`, `LAST_ADMIN`, `ROUTE_ROLE_EMPTY`, `SELECTION_REQUIRED`, `BLOCKING_ISSUES`, `INVITE_USED`, `INVITE_EXPIRED`, `INVITE_REVOKED` |
| 429 | Слишком много попыток ввода кода: `TOO_MANY_ATTEMPTS`, `details.retryAfterSeconds` — через сколько можно снова |
| 405 | Метод не поддерживается для этого адреса: `METHOD_NOT_ALLOWED` |
| Прочие 4xx | Ошибка запроса, которую отдаёт сам Spring (например, 406): `BAD_REQUEST`, HTTP-статус сохраняется |
| 500 | `INTERNAL_ERROR` — непредвиденная ошибка; HTTP-статус исходной ошибки сохраняется |

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
// Показываемый статус (D4): вычисляется одним выражением на бэкенде (DocumentReadRepository.DISPLAY_STATUS).
// IN_ENDORSEMENT — IN_APPROVAL, текущий этап — утверждение («На утверждении»); ENDORSED — APPROVED, утверждающий
// утвердил («Утверждён»); APPROVED без этапа утверждения — «Согласован». Экраны показывают его, а не status.
type DisplayStatus = DocumentStatus | "IN_ENDORSEMENT" | "ENDORSED";
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
- или у документа `visibility = ORG` **и он не черновик**: флаг действует после отправки, черновик — в том числе
  вернувшийся после возврата — всей компании не виден (DOC-5).

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
| `GET /orgs/current/join-requests?status=PENDING` | ADMIN | → `[{ id, user: UserRef, status, createdAt, previousRoles: RoleRef[] }]`; без `status` — только ожидающие; старые заявки первыми. `previousRoles` — роли, с которыми человек был в компании до исключения (D5): экран отмечает их заранее; у нового человека пусто |
| `POST /orgs/current/join-requests/{id}/approve` | ADMIN | `{ roleIds: number[], isAdmin?: boolean }` → `MemberView`. 409 `INVALID_STATE`; 400 `VALIDATION_FAILED`, если нет ни одной роли и не выдан `isAdmin`; роль другой компании — 404 |
| `POST /orgs/current/join-requests/{id}/reject` | ADMIN | → 200 |
| `GET /orgs/current/members` | ADMIN | → `MemberView[]` |
| `GET /orgs/current/colleagues` | Участник | → `MemberView[]` — только активные сотрудники своей компании, для раздела «Компания» (приёмка 24.09). Не участник — 403 |
| `GET /orgs/current/routes` | Участник | → `RouteOverview[]`: `{ documentTypeId, stages: { stageOrder, participants: { role: RoleRef, mandatory }[] }[] }` — маршруты компании по типам (раздел «Компания»). Недостающие маршруты по умолчанию создаются при обращении, как и при отправке |
| `PATCH /orgs/current/routes/{documentTypeId}/roles/{roleId}` | ADMIN | `{ mandatory: boolean }` → `RouteOverview[]` заново. Обязательную роль автор не уберёт из маршрута (#109). Роли нет в шаблоне вида — 404; у «Другого документа» (`GENERIC`) обязательных нет — 400 `VALIDATION_FAILED` |
| *SHOULD* `GET /orgs/current/roles/{id}/members` | Участник | → `UserRef[]` — активные носители роли, для добавления согласующего |
| `PUT /orgs/current/members/{memberId}/roles` | ADMIN | `{ roleIds }` → `MemberView & { returnedDocuments: number }`. Снятая роль действует сразу: документы, где человек ещё не решил в этой роли, возвращаются авторам (приёмка 24.09, п. 15); `returnedDocuments` — сколько, администратор видит это в сообщении. 403 `FORBIDDEN` (свои роли менять нельзя), 409 `INVALID_STATE` (участник отключён) |
| `PUT /orgs/current/members/{memberId}/admin` | ADMIN | `{ isAdmin }` → `MemberView`. 409 `LAST_ADMIN` |
| *SHOULD* `POST /orgs/current/members/{memberId}/disable` | ADMIN | → 200 `MemberView & { returnedDocuments: number }`; сразу, повторный вызов ничего не меняет (`returnedDocuments: 0`). Документы, где человек ещё не решил, возвращаются авторам. 409 `LAST_ADMIN` |

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
`GET /documents/{id}`). Кнопки бота кладут ещё два: `a_requests` — экран заявок (уведомление администратору о
заявке, LNK-4) и `s_<запрос в base64url>` — результаты поиска, когда в чате нашлось несколько документов (LNK-3;
MAX пропускает в параметре только `A-Z a-z 0-9 _ -`). Ссылка, отправленная в чат бота, приходит событием
`bot_started` с тем же параметром — бот отвечает кнопкой `open_app` с ним же (LNK-2).

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
| `meta` | JSON `{ documentTypeId?, title?, visibility, containsSensitive, fields?: Record<string,string> }` — принимается и без `Content-Type` у multipart-части; `containsSensitive` относится к этой версии |
| `main` | Основной файл: PDF или DOCX. Обязателен, если это не документ-форма |
| `attachments` | *SHOULD.* До 10 файлов: PDF, DOCX, XLSX, PNG, JPG |

**Документ-форма (#59)** — тот же адрес JSON-телом (`Content-Type: application/json`) с `content`
вместо файлов. Служебную записку заполняют прямо в приложении; модель не вызывается — поля уже
структурированы, правила проверяют их так же, как извлечённые из файла:

```ts
{ documentTypeId: number;          // обязателен: тип выбран человеком, определять нечего
  title?: string;                  // пусто — заголовок записки (поле subject), иначе название типа
  visibility: Visibility; containsSensitive: boolean;
  content: Record<string,string> } // поля схемы типа; те же ограничения, что у fields
```

Проверка — по правилам компании автора (#103). Неизвестное поле или «Другой документ» (`GENERIC`) — 400
`VALIDATION_FAILED`: его поля — общие реквизиты чужого файла, а не содержимое. Версия хранит `content`,
файлов у неё нет; в карточке — `versions[].content`, `check.fields` совпадают с ним (`source = "MANUAL"`).

Ответ 201 — `DocumentCard`. Проверка правил выполняется **в том же запросе**
и укладывается в `app.ai.timeout-seconds`; фронтенд показывает индикатор.
Документ сохраняется **до** обращения к модели: сбой или тайм-аут модели не теряет
документ, а даёт `modelAvailable = false`.

`fields` — поля, введённые вручную: при `containsSensitive = true` или когда модель
недоступна. Заголовок — до 255 символов; не более 100 полей и 10 000 символов в значении.
Ограничения файлов: 10 МБ на файл, 30 МБ на запрос, тип — по содержимому.

**Без `documentTypeId` — «Определить автоматически» (#86).** Модель по началу текста
выбирает один из типов с подробной проверкой; не уверена или недоступна — «Другой документ»
(`GENERIC`, общая проверка реквизитов, только предупреждения). В карточке — `type.autoDetected = true`.
С `containsSensitive = true` текст в модель не уходит, поэтому тип обязателен: без него — 400
`VALIDATION_FAILED` с текстом «Выберите тип документа…».

**Без `title`** — название по содержанию документа (модель), без модели — из имени файла.

### `GET /documents` — списки

Параметры: `tab` (обязателен): `WAITING_ME` — есть мой активный шаг, `MINE` — я автор,
`AVAILABLE` — остальные документы, которые я вижу по правилу «Кто видит документ»; `status` — показываемый статус
(`DisplayStatus`, в том числе `IN_ENDORSEMENT` и `ENDORSED`), `q` — поиск по названию, автору, номеру документа
(`id`) и регистрационному номеру из полей (NAV-3; регистр не важен, `%` и `_` — обычные символы), `typeId`, `authorId`,
`from`, `to` (даты создания), `page`, `size`. Черновик в `AVAILABLE` не попадает никогда: видимость «вся компания» действует после отправки (DOC-5).

```ts
type DocumentListItem = {
  id: number; title: string; type: { id: number; name: string };
  status: DocumentStatus; displayStatus: DisplayStatus; author: UserRef;
  currentVersionNo: number; currentStage: number | null;
  updatedAt: string;
  waitingSince: string | null;   // для WAITING_ME: activated_at моего шага
  // У «Другого документа» (GENERIC) — вид, как его назвал сам документ (поле doc_kind): «Договор аренды».
  // fromAi — нашёл ИИ (значок ✦), false — автор исправил вручную; null у видов из шаблонов (DOC-7).
  recognizedKind: { value: string; fromAi: boolean } | null;
};
```

Права применяются **до** фильтров: чужое не попадает в выдачу ни при каком запросе.
Счётчики «Ждут меня» и «Заявки» на главной — `total` соответствующего списка с `size=1`.

### `GET /documents/{id}` — карточка

```ts
type DocumentCard = {
  id: number; title: string;
  type: { id: number; code: string;   // GENERIC — «Другой документ», вид вне шаблонов (DOC-7)
          name: string; isGeneric: boolean;   // isGeneric — вид без схемы полей
          autoDetected: boolean };   // тип выбрала модель при загрузке
  status: DocumentStatus; displayStatus: DisplayStatus; visibility: Visibility;
  author: UserRef; currentVersionNo: number;
  versions: { versionNo: number; containsSensitive: boolean; createdAt: string; createdBy: UserRef; files: FileRef[];
              withdrawnAt: string | null;       // автор отозвал эту версию с согласования
              content: Record<string,string> | null }[];   // документ-форма (#59): содержимое вместо файлов;
                                                           // null — версия с файлом
  check: CheckResult | null;     // для текущей версии; null только у типа без схемы (is_generic)
  route: RouteView | null;       // null у черновика, который ещё не отправлялся
  permissions: {                 // вычисляет бэкенд — фронтенд правила не дублирует
    canEditFields: boolean; canUploadVersion: boolean; canSubmit: boolean;
    canAddApprover: boolean;
    canCorrectFile: boolean;     // автор, DRAFT или RETURNED, основной файл — DOCX (#86)
    canWithdraw: boolean;        // автор, IN_APPROVAL — «Отозвать с согласования»
  };
  myActiveStepIds: number[];     // шаги, по которым текущий пользователь может решить сейчас
  // Что изменилось в текущей версии по сравнению с предыдущей (приёмка 24.09): согласующему не нужно
  // перечитывать документ целиком. null у первой версии; пустые списки — документ не менялся.
  changes: {
    comparedToVersionNo: number;
    files: { change: "ADDED" | "REMOVED" | "REPLACED"; kind: "MAIN" | "ATTACHMENT"; fileName: string }[];
    fields: { name: string; label: string; before: string | null; after: string | null }[];
    contentChanged: boolean;   // изменилось содержимое документа-формы
  } | null;
};
```

### `DELETE /documents/{id}` — удалить черновик (DOC-4)

Только автор и только черновик, который **ни разу не отправлялся** → 204. Иначе 409 `INVALID_STATE` («Удалить можно
только черновик, который ещё не отправлялся»): у отправленного есть история, её не стираем. Чужой документ — 404.
Строки версий и файлов удаляются; сами файлы в хранилище остаются — они неизменяемы и в MVP не удаляются.

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

**Документ-форма (#59)** — тот же адрес JSON-телом `{ content: Record<string,string>, containsSensitive }`:
новая версия с исправленной формой целиком, проверяется правилами сразу, без модели. Те же статусы
(`DRAFT`, `RETURNED` → `DRAFT`). Документ с файлом так не правится — 400 `VALIDATION_FAILED`. Фронтенд
создаёт новую версию формы только так; если же новая версия формы пришла multipart-запросом без нового
основного файла, `content` переносится в неё вместе с переданными `fields` — форма не теряет содержимое.

Ответ — `DocumentCard`.

### `PUT /documents/{id}/versions/{versionNo}/fields` — поправить поля

`{ fields: Record<string,string> }` → `CheckResult`. Правила проверяются заново.
Только для текущей версии в `DRAFT`. Возвращённая версия не редактируется —
она уже в истории; исправление — новая версия.

Файл при этом **не меняется**: это «ИИ прочитал поле неверно, а в файле всё правильно».
Изменённое поле получает `source = "MANUAL"` и `fileValue` — что написано в файле, чтобы
согласующий видел ручную правку (#86). `fileValue = ""` — модель прочитала файл и этого поля в нём нет,
а автор его заполнил («в файле этого нет»). Пустое и отсутствующее значение равны: поле, которое открыли
и не изменили, остаётся `MODEL`. Исправить сам документ — `corrections` ниже.

У документа-формы (#59) поля и есть содержимое: правка меняет и `content` текущего черновика.

### `POST /documents/{id}/versions/{versionNo}/corrections` — исправить в файле (#86)

`{ fields: Record<string,string> }` — только изменённые поля. Бэкенд находит в тексте DOCX
прежнее значение каждого поля (по цитате модели, если оно встречается несколько раз),
заменяет его новым в том же фрагменте текста — оформление сохраняется, — и создаёт новую
версию с исправленным файлом (приложения переходят как есть). Новая версия проверяется
заново: модель снова читает файл.

```ts
type FileCorrectionResult = {
  card: DocumentCard;                         // уже с новой версией, статус DRAFT
  applied: string[];                          // поля, вписанные в файл
  notApplied: { field: string; message: string }[];  // почему не вписано: поля нет в файле,
                                              // значение не найдено, неоднозначно, занимает
                                              // несколько абзацев — исправить в самом документе
};
```

- Только автор, текущая версия в `DRAFT` или `RETURNED` (из `RETURNED` → `DRAFT`), иначе 409.
- Основной файл не DOCX (PDF) — 400 `VALIDATION_FAILED`: такой файл исправляют в исходнике.
- Ни одно поле вписать не удалось — 400 с причинами; новая версия не создаётся.

### `POST /documents/{id}/versions/{versionNo}/recheck` — проверить заново (#90)

Без тела → `DocumentCard`. Текущая версия перепроверяется **по текущим правилам компании** по сохранённым полям —
модель не вызывается, файл не перечитывается. Замечания — снимок на момент проверки: после изменения правил черновик
сам не пересчитывается, а документы на согласовании не меняются вовсе.
- Только автор (чужой компании документ — 404, другому участнику — 403), текущая версия `DRAFT` или `RETURNED`,
  иначе 409 `INVALID_STATE`. Идёт проверка моделью — 409.
- `DRAFT` — перепроверяется сама версия. `RETURNED` — возвращённая версия остаётся в истории: создаётся версия
  `versionNo + 1` с теми же файлами, полями и содержимым формы, она и проверяется, документ → `DRAFT`.
- Всё в одной транзакции под блокировкой документа: при параллельном запросе или ошибке правил сохранённые поля
  не теряются, версия не остаётся в промежуточном состоянии.

### Правила проверки компании (#90)

| Метод | Кто | Что |
|---|---|---|
| `GET /orgs/current/rules` | Участник | → `CompanyRules` |
| `PUT /orgs/current/rules/{ruleId}` | ADMIN | `RuleSetting` → `CompanyRules`. 400 `VALIDATION_FAILED` — закон, пустой текст, неверное значение; 403 `NOT_ADMIN`; нет правила — 404 |
| `DELETE /orgs/current/rules/{ruleId}` | ADMIN | «Сбросить к типовому» → `CompanyRules` |

```ts
type CompanyRules = {
  canEdit: boolean;                                   // текущий участник — администратор
  types: { documentTypeId: number; code: string; name: string; rules: CompanyRule[] }[];  // «Другой документ» последним
};
type CompanyRule = {
  id: number; fieldName: string; fieldLabel: string;
  check: "REQUIRED" | "DATE_FORMAT" | "DATE_NOT_FUTURE" | "MATCHES_PATTERN" | "MIN_LENGTH" | "ONE_OF";
  kind: RuleKind;              // действующий: рекомендация сервиса со своим источником компании → INTERNAL_POLICY
  enabled: boolean; severity: Severity; description: string;
  sourceTitle: string; sourceUrl: string | null; sourceRef: string | null;
  minLength: number | null;    // только MIN_LENGTH
  allowedValues: string[] | null;  // только ONE_OF
  customized: boolean;         // «Изменено компанией»
  locked: boolean;             // закон — не меняется
  template: { kind; severity; description; sourceTitle; sourceRef; minLength; allowedValues };
};
type RuleSetting = {           // желаемое состояние; хранится только отличие от шаблона
  enabled: boolean; severity: Severity; description: string;
  sourceTitle: string | null;  // пусто — источник шаблона; свой источник — ссылка шаблона не показывается
  sourceRef: string | null;
  minLength?: number;          // 1..5000, только MIN_LENGTH
  allowedValues?: string[];    // 1..20 непустых, только ONE_OF
};
```

Что можно менять, а что нет — CLAUDE.md, «Правила проверки компании». Настройка действует на новые проверки:
загрузку, новую версию, правку полей и `recheck`.

### `PUT /documents/{id}/versions/{versionNo}/type` — сменить тип черновика (#86)

`{ documentTypeId: number }` → `DocumentCard`. Если модель определила вид неверно: текущая
версия проверяется заново по схеме и правилам нового типа, `type.autoDetected` становится
`false`. Только автор и только текущий черновик, иначе 409. У документа-формы тип не меняется — 400
`VALIDATION_FAILED`: поля формы — это схема её типа.

### Результат проверки

```ts
type CheckResult = {
  versionNo: number;
  status: "CHECKED" | "FAILED";  // FAILED — проверка не выполнилась: «Проверка не выполнена»,
                                 // повтор — сохранить поля ещё раз; отправка недоступна
  modelAvailable: boolean;       // false — показать «Разбор моделью недоступен, заполните поля вручную»
  textMissing: boolean;          // true — в файле нет текста (скан): модель не вызывалась, поля вручную (#86)
  fields: { name: string; value: string | null; source: "MODEL" | "MANUAL"; quote: string | null; page: number | null;
            fileValue?: string | null }[];   // что в файле, если автор изменил поле вручную без правки файла
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
  // Кто уже одобрил прошлую версию, если документ с тех пор не менялся (те же файлы и поля):
  // при отправке их шаги сразу согласованы с autoReason = CARRIED_OVER. null — переносить нечего.
  carryOver: { fromVersionNo: number; approvals: { roleId: number; userId: number }[] } | null;
  // RTE-6: маршрут прошлой отправленной версии — конструктор заполняется им, а не шаблоном. Без решений, без
  // автосогласования автором и без выбывших. null — документ ещё не отправлялся.
  previous: {
    versionNo: number;
    stages: { participants: { userId: number; roleId: number }[] }[];
    endorser: { userId: number; roleId: number } | null;
  } | null;
}
```

`stages` — шаблон вида документа: из него конструктор берёт предзаполнение (D3) и признак `mandatory` у ролей
(обязательных нельзя убрать). Утверждающий по умолчанию — последний этап шаблона, если в нём один человек (D4).

`problems` не пуст — кнопка «Отправить» неактивна, текст показывается пользователю.

Доступен **автору черновика**. Человек без компании получает 403 на любой id (существует документ или нет — не
раскрывается); документ другой компании или невидимый человеку — 404; тот, кто видит, но не автор, — 403;
не черновик — 409 `INVALID_STATE`. Предпросмотр не создаёт шагов согласования и не меняет документ и показывает ровно то, что сделает
отправка. Единственное, что он может записать, — шаблон маршрута компании: если для типа документа
маршрута ещё нет, он создаётся по умолчанию при первом обращении (при отправке — так же).

### `POST /documents/{id}/withdraw` — отозвать с согласования (приёмка 24.09)

Только **автор** и только `IN_APPROVAL` → карточка. Ожидающие шаги версии получают `SKIPPED`, документ —
`RETURNED`, версия — `withdrawnAt`. Тем, чья очередь уже подошла, бот сообщает, что решение больше не нужно.
Дальше — как после возврата: новая версия и отправка заново с первого этапа. Не автор — 403, не на
согласовании — 409 `INVALID_STATE`; решение по шагу отозванного документа — 409 `STEP_NOT_ACTIVE`.

### `POST /documents/{id}/submit` — отправить

**Маршрут из конструктора** (с 25.09, D3/D4, docs/review-round-1/DECISIONS.md):

```ts
{
  stages: { participants: { userId: number; roleId: number }[] }[];   // этапы по порядку, в этапе — одновременно
  endorser?: { userId: number; roleId: number } | null;               // утверждающий — последний шаг
}
```

Шаблон только предзаполняет маршрут: автор ставит людей в любом порядке и убирает всех, кроме обязательных. Сервер
проверяет:
- **все обязательные роли на месте** — роль закрыта, если в маршруте где угодно есть её носитель (иначе 400
  `MANDATORY_ROLE_MISSING`, `details.role`);
- **один человек — один раз**, в том числе утверждающий (400 `VALIDATION_FAILED` с именем);
- **нет пустых этапов** (400 `VALIDATION_FAILED`);
- каждый — активный носитель роли, под которой стоит, и не автор (404 / 400);
- маршрут не пустой, если кроме автора есть кому согласовать (400).

Шаги этапов — `kind = APPROVAL`, этапы нумеруются подряд с 1; утверждающий — `kind = ENDORSEMENT`, отдельным этапом
после всех. `origin = TEMPLATE` — по одному человеку на каждую роль шаблона (подставленный или первый выбранный из её
кандидатов), остальные — `ADDED_BY_AUTHOR`.

**Прежний формат** (до 25.09) по-прежнему принимается и переводится в тот же маршрут:
`selections` — выбор там, где кандидатов несколько; `extraApprovers` — добавленные к шаблону (`newStage` — отдельным
этапом перед этапом шаблона `stageOrder`, или последним). Смешивать форматы нельзя — 400.

Ответ — `DocumentCard`. 409: `INVALID_STATE`, `ROUTE_ROLE_EMPTY`, `SELECTION_REQUIRED` (прежний формат),
`BLOCKING_ISSUES`. Тело можно не передавать, если выбирать не из чего — тогда маршрут по шаблону.

- **Нельзя отправить** (`BLOCKING_ISSUES`), если у типа с проверкой она не выполнилась (`check_status ≠ CHECKED`) или
  есть замечание `BLOCKER`; та же логика определяет `permissions.canSubmit`.
- Если решать некому (обязательные роли только у автора, согласовать больше некому), документ становится
  «Согласован» сразу, а шаг автора в истории подписан «согласовано автором как <роль>».
- **Одобрения прошлой версии сохраняются, если документ не менялся** (приёмка 24.09, п. 1): те же файлы (по ключу
  хранилища) и те же значения полей, что у предыдущей версии. Шаг того же человека в той же роли создаётся сразу
  `APPROVED` с `autoReason = CARRIED_OVER`. Изменился хоть один файл или поле — согласуют все заново.
- `permissions.canAddApprover` — `true` у автора черновика.

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
  kind: "APPROVAL" | "ENDORSEMENT";   // ENDORSEMENT — утверждение, последний шаг (D4): кнопка «Утвердить»
  decision: Decision; comment: string | null;
  activatedAt: string | null;    // когда этап шага стал активным; null — этап ещё не начался
  decidedAt: string | null;      // у AUTHOR_HOLDS_ROLE — момент отправки
  autoReason: "AUTHOR_HOLDS_ROLE" | "CARRIED_OVER" | "MEMBER_REMOVED" | null;
  // AUTHOR_HOLDS_ROLE — «согласовано автором как <роль>»; CARRIED_OVER — «согласовано ранее»: одобрение прошлой
  // версии, документ не менялся; MEMBER_REMOVED — у SKIPPED: согласующего исключили или сняли роль, документ вернулся
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

- Доступен любому активному участнику и учитывает только документы его текущей компании
  (для `X-Demo-Act-As` — личной демо-песочницы).
- Период задаётся датами включительно в часовом поясе `Europe/Moscow` и применяется к
  моменту первой отправки; без параметров считается вся история. Не входят документы, ни разу не
  отправленные на согласование. Документ, который вернули и он снова стал черновиком, входит: у него
  уже есть первая отправка (ревью #81).
- `documentsCount` — число отправленных документов в выборке. `returnRate` — доля из них,
  которые хотя бы раз возвращались на доработку, от `0` до `1`; при пустой выборке `null`.
- `medianApprovalHours` — медиана часов от первой отправки до итогового `APPROVED` среди
  согласованных документов выборки; если согласованных документов нет — `null`.

## Документация API

`springdoc` генерирует OpenAPI по коду — это инструмент команды на время разработки,
в профиле `dev`. В сдачу схема не идёт: `openapi.yaml` и `DATA-API.yaml` кейс требует
только от решений с собственным API, а мы его не заявляем (CLAUDE.md, решение C).
Единственный источник правды по эндпоинтам для нас — этот файл.

## Не для фронтенда

`POST /bot/webhook` — события Bot API на стенде (`max.bot.update-mode=webhook`). Вызывает сервер
MAX, а не мини-приложение — initData здесь нет, эндпоинт открыт в `SecurityConfiguration`. Подлинность
проверяется заголовком `X-Max-Bot-Api-Secret` (значение задаётся при подписке, `max.bot.webhook-secret`);
несовпадение — 401. Бэкенд подписывается сам при старте (`POST /subscriptions` на `<MAX_BOT_WEBHOOK_URL>/api/v1/bot/webhook`).
