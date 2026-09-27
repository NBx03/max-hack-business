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
  /** Главная (NAV-1): плитки разделов и «Новый документ». */
  home: '/home',
  /** Прежний адрес списка документов — ведёт на главную (старые ссылки и закладки). */
  documents: '/documents',
  /** Список документов одного раздела: waiting | mine | shared (NAV-2). */
  documentList: '/documents/list/:list',
  /** Поиск по всем разделам (NAV-3, LNK-3): с главной и по кнопке бота «Показать все». */
  documentSearch: '/documents/search',
  /** Раздел «Компания» (плитка главной): сотрудники, администрирование, правила, демо. */
  company: '/company',
  /** «Правила проверки» (#91): внутри раздела «Компания». */
  companyRules: '/company/rules',
  documentUpload: '/documents/new',
  /** Служебная записка, заполненная прямо в приложении, без файла (#59). */
  memoForm: '/documents/new/memo',
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
  ROUTE_PATTERNS.home,
  ROUTE_PATTERNS.welcome,
  ROUTE_PATTERNS.pending,
]);

export function joinPath(code?: string): string {
  return code ? `${ROUTE_PATTERNS.join}?code=${encodeURIComponent(code)}` : ROUTE_PATTERNS.join;
}

export function joinPersonalPath(token: string): string {
  return ROUTE_PATTERNS.joinPersonal.replace(':token', encodeURIComponent(token));
}

export function documentSearchPath(query?: string): string {
  return query ? `${ROUTE_PATTERNS.documentSearch}?q=${encodeURIComponent(query)}` : ROUTE_PATTERNS.documentSearch;
}

/**
 * Запрос из параметра запуска s_<base64url> (LNK-3): бот кладёт туда текст, который человек искал в чате. MAX пропускает
 * в параметре только A-Z a-z 0-9 _ -, поэтому base64url; битый — null.
 */
export function decodeSearchPayload(payload: string): string | null {
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    return text.trim() || null;
  } catch {
    return null;
  }
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

/** Правила проверки; ruleId — сразу открыть это правило (ссылка «Настроить правило» с экрана проверки). */
export function companyRulesPath(ruleId?: number): string {
  return ruleId === undefined ? ROUTE_PATTERNS.companyRules : `${ROUTE_PATTERNS.companyRules}?rule=${ruleId}`;
}

export function routePreviewPath(id: number | string): string {
  return ROUTE_PATTERNS.routePreview.replace(':id', String(id));
}

/** Разделы документов (NAV-1, NAV-2) — одни и те же названия на плитках, в заголовках списков и в текстах бота. */
export type DocumentListKey = 'waiting' | 'mine' | 'shared';

export const DOCUMENT_LISTS: Record<DocumentListKey, { title: string; hint: string; tab: 'WAITING_ME' | 'MINE' | 'AVAILABLE' }> = {
  waiting: { title: 'На моём согласовании', hint: 'Ждут вашего решения', tab: 'WAITING_ME' },
  mine: { title: 'Мои документы', hint: 'Созданные вами, включая черновики', tab: 'MINE' },
  // «С вашим решением» — согласующий ищет здесь то, что уже решил (#56, аудит 27.09).
  shared: { title: 'Общие документы', hint: 'С вашим решением и открытые всем', tab: 'AVAILABLE' },
};

export function isDocumentListKey(value: string | undefined): value is DocumentListKey {
  return value === 'waiting' || value === 'mine' || value === 'shared';
}

export function documentListPath(list: DocumentListKey): string {
  return ROUTE_PATTERNS.documentList.replace(':list', list);
}