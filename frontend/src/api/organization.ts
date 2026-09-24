import { apiRequest } from './client';
import type { MemberView, OrganizationMetrics, RouteOverview } from './types';

export interface MetricsPeriod {
  from?: string;
  to?: string;
}

export function getOrganizationMetrics(period: MetricsPeriod = {}): Promise<OrganizationMetrics> {
  const params = new URLSearchParams();
  if (period.from) params.set('from', period.from);
  if (period.to) params.set('to', period.to);
  const query = params.toString();
  return apiRequest<OrganizationMetrics>(`/orgs/current/metrics${query ? `?${query}` : ''}`);
}

/** Только счётчик для бейджа на вкладке "Админ" - список заявок делает #54. */
export function getPendingJoinRequestsCount(): Promise<number> {
  return apiRequest<{ id: number }[]>('/orgs/current/join-requests?status=PENDING').then((items) => items.length);
}

/** Сотрудники своей компании — любому участнику (раздел «Компания»); управление — api/admin.ts. */
export function getColleagues(): Promise<MemberView[]> {
  return apiRequest<MemberView[]>('/orgs/current/colleagues');
}

/** Маршруты согласования своей компании по типам документов — любому участнику. */
export function getRoutes(): Promise<RouteOverview[]> {
  return apiRequest<RouteOverview[]>('/orgs/current/routes');
}
