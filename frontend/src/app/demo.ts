import type { DemoSandboxUser } from '../api/types';

/** С кого начинать демо: с автора документов — у него всё основное действие сценария. */
export function demoEntryUser(users: DemoSandboxUser[] | null): number | null {
  if (!users || users.length === 0) {
    return null;
  }
  const author = users.find((u) => u.roles.some((r) => r.code === 'DEPARTMENT_HEAD'));
  return (author ?? users[0]).user.id;
}
