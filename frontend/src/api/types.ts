// Общие объекты и ответ GET /me - см. docs/API_CONTRACTS.md.
import type { AutoReason, DocumentStatus, StepDecision } from '../theme/status';

export type { DocumentStatus, StepDecision };

export interface UserRef {
  id: number;
  fullName: string;
}

export interface RoleRef {
  id: number;
  code: string;
  name: string;
}

export interface MembershipRef {
  orgId: number;
  orgName: string;
  roles: RoleRef[];
  isAdmin: boolean;
}

export interface PendingJoinRequestRef {
  id: number;
  orgName: string;
  createdAt: string;
}

export interface SandboxRef {
  orgId: number;
  orgName: string;
}

export interface ActingAsRef {
  user: UserRef;
  roles: RoleRef[];
  isAdmin: boolean;
}

export interface MeResponse {
  user: UserRef;
  /** Только реальная компания. null - экран приветствия, это не ошибка. */
  membership: MembershipRef | null;
  pendingJoinRequest: PendingJoinRequestRef | null;
  demoMode: boolean;
  sandbox: SandboxRef | null;
  actingAs: ActingAsRef | null;
  startParam: string | null;
}

export interface DemoSandboxUser {
  user: UserRef;
  roles: RoleRef[];
  isAdmin: boolean;
}

export interface DemoSandboxResponse {
  orgId: number;
  orgName: string;
  users: DemoSandboxUser[];
}

// ---------- Подключение компании: создание, код, личная ссылка, заявка (#18) ----------

export interface OrganizationCreated {
  id: number;
  name: string;
}

export interface InvitePreview {
  orgName: string;
}

export interface JoinRequestCreated {
  id: number;
  orgName: string;
  status: string;
  createdAt: string;
}

export interface PersonalInvitePreview {
  orgName: string;
  roles: RoleRef[];
  expiresAt: string;
}

// ---------- Подключение компании: приглашение, заявки, участники (#54) ----------

export interface InviteCodeInfo {
  code: string;
  /** https://max.ru/<бот>?startapp=c_<code> - готовая ссылка, бэкенд собирает сам. */
  link: string;
  createdAt: string;
}

/** SHOULD: личная ссылка - см. API_CONTRACTS.md, "SHOULD: личные ссылки". */
export interface PersonalInviteView {
  id: number;
  /** https://max.ru/<бот>?startapp=p_<token> */
  link: string;
  expiresAt: string;
  roles: RoleRef[];
}

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface JoinRequestView {
  id: number;
  user: UserRef;
  status: JoinRequestStatus;
  createdAt: string;
}

export type MemberStatus = 'ACTIVE' | 'DISABLED';

export interface MemberView {
  memberId: number;
  user: UserRef;
  status: MemberStatus;
  roles: RoleRef[];
  isAdmin: boolean;
  joinedAt: string;
}

// ---------- Показатели эффекта (#58) ----------

export interface OrganizationMetrics {
  medianApprovalHours: number | null;
  /** Доля документов с хотя бы одним возвратом, от 0 до 1. */
  returnRate: number | null;
  documentsCount: number;
}

// ---------- Документы (#7, #55) - docs/API_CONTRACTS.md, "Документы" и "Маршрут и решения" ----------

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export type Visibility = 'PRIVATE' | 'ORG';
export type Severity = 'BLOCKER' | 'WARNING' | 'INFO';
export type RuleKind = 'LEGAL' | 'INTERNAL_POLICY' | 'PRODUCT_RULE';

export interface DocumentTypeField {
  name: string;
  type: 'STRING' | 'DATE' | 'NUMBER' | 'PERSON' | 'ORGANIZATION';
  label: string;
  hint: string;
}

/** Тип документа в DocumentListItem - только то, что нужно строке списка. */
export interface DocumentTypeRef {
  id: number;
  name: string;
}

export interface DocumentType {
  id: number;
  code: string;
  name: string;
  isGeneric: boolean;
  fields: DocumentTypeField[];
}

export interface FileRef {
  id: number;
  kind: 'MAIN' | 'ATTACHMENT';
  fileName: string;
  mimeType: string;
  size: number;
  downloadUrl: string;
  downloadExpiresAt: string;
}

export interface DocumentListItem {
  id: number;
  title: string;
  type: DocumentTypeRef;
  status: DocumentStatus;
  author: UserRef;
  currentVersionNo: number;
  currentStage: number | null;
  updatedAt: string;
  /** Только во вкладке "Ждут меня" - activatedAt моего шага, для "ждёт N дней". */
  waitingSince: string | null;
}

export interface ValidationIssue {
  ruleId: number;
  fieldName: string;
  message: string;
  severity: Severity;
  kind: RuleKind;
  sourceTitle: string;
  sourceUrl: string | null;
  sourceRef: string | null;
  quote: string | null;
  page: number | null;
}

export interface CheckField {
  name: string;
  value: string | null;
  source: 'MODEL' | 'MANUAL';
  quote: string | null;
  page: number | null;
}

export interface CheckResult {
  versionNo: number;
  status: 'CHECKED' | 'FAILED';
  modelAvailable: boolean;
  fields: CheckField[];
  issues: ValidationIssue[];
}

export interface DocumentVersion {
  versionNo: number;
  containsSensitive: boolean;
  createdAt: string;
  createdBy: UserRef;
  files: FileRef[];
}

export type StepOrigin = 'TEMPLATE' | 'ADDED_BY_AUTHOR';
export type StageState = 'WAITING' | 'ACTIVE' | 'DONE';

export interface StepView {
  id: number;
  versionNo: number;
  stageOrder: number;
  role: RoleRef;
  approver: UserRef;
  origin: StepOrigin;
  decision: StepDecision;
  comment: string | null;
  activatedAt: string | null;
  decidedAt: string | null;
  autoReason: AutoReason;
}

export interface RouteStage {
  stageOrder: number;
  state: StageState;
  steps: StepView[];
}

export interface RouteView {
  versionNo: number;
  stages: RouteStage[];
  /** Шаги прошлых версий - только чтение. */
  history: StepView[];
}

export interface DocumentPermissions {
  canEditFields: boolean;
  canUploadVersion: boolean;
  canSubmit: boolean;
  canAddApprover: boolean;
}

export interface DocumentCard {
  id: number;
  title: string;
  type: { id: number; name: string; isGeneric: boolean };
  status: DocumentStatus;
  visibility: Visibility;
  author: UserRef;
  currentVersionNo: number;
  versions: DocumentVersion[];
  /** Для текущей версии; null только у generic-типа. */
  check: CheckResult | null;
  /** null у черновика, который ещё не отправлялся. */
  route: RouteView | null;
  permissions: DocumentPermissions;
  myActiveStepIds: number[];
}

export type RouteResolution = 'SELECT' | 'AUTO' | 'SKIPPED' | 'AUTHOR_HOLDS_ROLE';

export interface RoutePreviewParticipant {
  role: RoleRef;
  mandatory: boolean;
  /** Автор исключён. */
  candidates: UserRef[];
  /** Проставлен, если кандидат один. */
  selectedUserId: number | null;
  resolution: RouteResolution;
}

export interface RoutePreviewStage {
  stageOrder: number;
  participants: RoutePreviewParticipant[];
}

export interface RoutePreviewProblem {
  code: 'ROUTE_ROLE_EMPTY' | 'BLOCKING_ISSUES';
  message: string;
}

export interface RoutePreview {
  stages: RoutePreviewStage[];
  problems: RoutePreviewProblem[];
}
