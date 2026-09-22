// Общие объекты и ответ GET /me - см. docs/API_CONTRACTS.md.

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

export type DocumentStatus = 'DRAFT' | 'IN_APPROVAL' | 'APPROVED' | 'RETURNED' | 'REJECTED';
export type Visibility = 'PRIVATE' | 'ORG';
export type Severity = 'BLOCKER' | 'WARNING' | 'INFO';
export type RuleKind = 'LEGAL' | 'INTERNAL_POLICY' | 'PRODUCT_RULE';

export interface DocumentTypeField {
  name: string;
  type: 'STRING' | 'DATE' | 'NUMBER' | 'PERSON' | 'ORGANIZATION';
  label: string;
  hint: string;
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

export interface DocumentCard {
  id: number;
  title: string;
  type: { id: number; name: string; isGeneric: boolean };
  status: DocumentStatus;
  visibility: Visibility;
  author: UserRef;
  currentVersionNo: number;
  versions: DocumentVersion[];
  check: CheckResult | null;
  route: unknown | null;
  permissions: {
    canEditFields: boolean;
    canUploadVersion: boolean;
    canSubmit: boolean;
    canAddApprover: boolean;
  };
  myActiveStepIds: number[];
}
