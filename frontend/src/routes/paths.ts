// Пути экранов - нумерация и названия из docs/SCREENS.md. Значения-заглушки:
// путь и сама вёрстка экрана - отдельные задачи (#1, #7, #18), здесь только
// то, что нужно, чтобы навигация по /me и startParam уже работала.

export const ROUTE_PATTERNS = {
  welcome: '/welcome',
  createCompany: '/company/create',
  adminInvite: '/admin/invite',
  join: '/join',
  joinPersonal: '/join/personal/:token',
  pending: '/pending',
  adminRequests: '/admin/requests',
  adminMembers: '/admin/members',
  documents: '/documents',
  documentUpload: '/documents/new',
  documentCheck: '/documents/:id/check',
  documentCard: '/documents/:id',
  routePreview: '/documents/:id/route',
} as const;

export function joinPath(code?: string): string {
  return code ? `${ROUTE_PATTERNS.join}?code=${encodeURIComponent(code)}` : ROUTE_PATTERNS.join;
}

export function joinPersonalPath(token: string): string {
  return ROUTE_PATTERNS.joinPersonal.replace(':token', encodeURIComponent(token));
}

export function documentCardPath(id: number | string): string {
  return ROUTE_PATTERNS.documentCard.replace(':id', String(id));
}
