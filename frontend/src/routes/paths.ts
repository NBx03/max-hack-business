// Пути экранов - нумерация и названия из docs/SCREENS.md.

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
  /** Раздел «Компания» нижнего меню: сведения о компании, администрирование, демо. */
  company: '/company',
  documentUpload: '/documents/new',
  documentCheck: '/documents/:id/check',
  /** Загрузка исправленного файла после RETURNED - docs/SCREENS.md, "Правки документов". */
  documentNewVersion: '/documents/:id/new-version',
  documentCard: '/documents/:id',
  routePreview: '/documents/:id/route',
} as const;

// Корневые экраны - без истории внутри приложения выше них некуда возвращаться,
// поэтому системная BackButton моста на них скрыта (routes/useMaxBackButton.ts).
// Рядом с ROUTE_PATTERNS, а не в самом хуке - иначе новый корневой экран можно
// добавить в паттерны и забыть про этот список, ничто не укажет на связь.
export const ROOT_ROUTE_PATTERNS: ReadonlySet<string> = new Set([
  ROUTE_PATTERNS.documents,
  ROUTE_PATTERNS.company,
  ROUTE_PATTERNS.welcome,
  ROUTE_PATTERNS.pending,
]);

export function joinPath(code?: string): string {
  return code ? `${ROUTE_PATTERNS.join}?code=${encodeURIComponent(code)}` : ROUTE_PATTERNS.join;
}

export function joinPersonalPath(token: string): string {
  return ROUTE_PATTERNS.joinPersonal.replace(':token', encodeURIComponent(token));
}

export function documentCardPath(id: number | string): string {
  return ROUTE_PATTERNS.documentCard.replace(':id', String(id));
}

export function documentCheckPath(id: number | string): string {
  return ROUTE_PATTERNS.documentCheck.replace(':id', String(id));
}

export function documentNewVersionPath(id: number | string): string {
  return ROUTE_PATTERNS.documentNewVersion.replace(':id', String(id));
}

export function routePreviewPath(id: number | string): string {
  return ROUTE_PATTERNS.routePreview.replace(':id', String(id));
}
