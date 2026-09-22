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
