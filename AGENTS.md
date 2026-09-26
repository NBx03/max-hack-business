# AGENTS.md — для агентов (Codex и другие)

Полный контекст проекта — [CLAUDE.md](CLAUDE.md) и [docs/HANDOFF.md](docs/HANDOFF.md): прочитайте их перед задачей,
правила там общие для всех агентов команды.

Главное правило интерфейса:

- **UI/UX — по [docs/review-round-1/REVIEW-ROUND-1.md](docs/review-round-1/REVIEW-ROUND-1.md), дизайн-принципы в §2.**
  Решения D1–D7 и выбор между вариантами дизайна — [docs/review-round-1/DECISIONS.md](docs/review-round-1/DECISIONS.md).
  Если CLAUDE.md, `docs/SCREENS.md`, комментарии в коде или сам код противоречат review — прав review.
- Экраны собираются только из дизайн-системы `frontend/src/ui/` (токены и базовые компоненты).
- Задачу сейчас может взять любой и менять любые модули, нужные для пункта; в описании PR изменения делятся на
  «Бэкенд» и «Фронтенд» (docs/HANDOFF.md, раздел 4).
