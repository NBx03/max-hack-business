import { apiRequest } from './client';

/** Только счётчик для бейджа на вкладке "Админ" - список заявок делает #54. */
export function getPendingJoinRequestsCount(): Promise<number> {
  return apiRequest<{ id: number }[]>('/orgs/current/join-requests?status=PENDING').then((items) => items.length);
}
