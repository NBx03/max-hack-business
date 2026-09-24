import type { DemoSandboxUser, MeResponse } from '../api/types';

/**
 * В чью демонстрацию вернуть человека при открытии приложения, или null — не возвращать.
 * Только у того, у кого нет своей компании (это жюри), и не при открытии по ссылке: приглашение
 * или документ из уведомления важнее демонстрации. Ссылка остаётся ссылкой и после перезагрузки
 * страницы — /me присылает её параметр весь запуск (ревью #95, п. 2).
 */
export function demoActorToResume(me: MeResponse, saved: number | null): number | null {
  if (saved === null || me.startParam || me.actingAs || me.membership || !me.sandbox) {
    return null;
  }
  return saved;
}

/** С кого начинать демо: с автора документов — у него всё основное действие сценария. */
export function demoEntryUser(users: DemoSandboxUser[] | null): number | null {
  if (!users || users.length === 0) {
    return null;
  }
  const author = users.find((u) => u.roles.some((r) => r.code === 'DEPARTMENT_HEAD'));
  return (author ?? users[0]).user.id;
}
