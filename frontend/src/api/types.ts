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

// Подключение компании - см. docs/API_CONTRACTS.md, «Подключение компании».

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
