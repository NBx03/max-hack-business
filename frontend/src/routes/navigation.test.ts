import { describe, expect, it } from 'vitest';
import type { MeResponse } from '../api/types';
import { guardTarget } from './guards';
import { resolveEntryRoute } from './resolveEntryRoute';

// Навигация по /me - docs/SCREENS.md, "Навигация". Проверяем чистые функции: какой экран
// открыть при входе и куда увести с экрана при изменившемся /me.

const base: MeResponse = {
  user: { id: 1, fullName: 'Проверяющий' },
  membership: null,
  pendingJoinRequest: null,
  demoMode: true,
  sandbox: null,
  actingAs: null,
  startParam: null,
};

const member: MeResponse = {
  ...base,
  membership: { orgId: 5, orgName: 'ООО «Тест»', roles: [], isAdmin: true },
};
const pending: MeResponse = {
  ...base,
  pendingJoinRequest: { id: 77, orgName: 'ООО «Ромашка»', createdAt: '2026-09-22T10:00:00Z' },
};
const inSandbox: MeResponse = {
  ...base,
  sandbox: { orgId: 900, orgName: 'Демо-компания' },
  actingAs: { user: { id: 101, fullName: 'Демо Автор' }, roles: [], isAdmin: false },
};

describe('resolveEntryRoute', () => {
  it('без компании и ссылки - приветствие, с компанией - список', () => {
    expect(resolveEntryRoute(base)).toBe('/welcome');
    expect(resolveEntryRoute(member)).toBe('/documents');
  });

  it('проверяющий в песочнице - к документам, хотя реальной компании нет', () => {
    expect(resolveEntryRoute(inSandbox)).toBe('/documents');
  });

  it('песочница есть, но участник не выбран - приветствие («Вернуться в демо»)', () => {
    expect(resolveEntryRoute({ ...inSandbox, actingAs: null })).toBe('/welcome');
  });

  it('ссылки c_, p_, d_ ведут на свои экраны', () => {
    expect(resolveEntryRoute({ ...base, startParam: 'c_KX7M2PQR' })).toBe('/join?code=KX7M2PQR');
    expect(resolveEntryRoute({ ...base, startParam: 'p_token' })).toBe('/join/personal/token');
    expect(resolveEntryRoute({ ...member, startParam: 'd_5' })).toBe('/documents/5');
  });

  it('приглашение игнорируется, если человек уже в компании или ждёт решения', () => {
    expect(resolveEntryRoute({ ...member, startParam: 'c_KX7M2PQR' })).toBe('/documents');
    expect(resolveEntryRoute({ ...pending, startParam: 'p_token' })).toBe('/pending');
  });

  it('отработавший startParam больше не учитывается', () => {
    expect(resolveEntryRoute({ ...member, startParam: 'd_5' }, false)).toBe('/documents');
    expect(resolveEntryRoute({ ...base, startParam: 'c_KX7M2PQR' }, false)).toBe('/welcome');
  });
});

describe('guardTarget', () => {
  it('экраны подключения: компания появилась - к документам, подана заявка - к ожиданию', () => {
    expect(guardTarget('onboarding', base, '/welcome')).toBeNull();
    expect(guardTarget('onboarding', member, '/documents')).toBe('/documents');
    expect(guardTarget('onboarding', inSandbox, '/documents')).toBe('/documents');
    expect(guardTarget('onboarding', pending, '/pending')).toBe('/pending');
  });

  it('после создания компании - сразу на экран приглашения (SCREENS.md, экран 2)', () => {
    expect(guardTarget('createCompany', base, '/welcome')).toBeNull();
    expect(guardTarget('createCompany', member, '/documents')).toBe('/admin/invite');
  });

  it('ожидание решения: заявку одобрили - к документам, отменили или отклонили - по /me', () => {
    expect(guardTarget('pending', pending, '/pending')).toBeNull();
    expect(guardTarget('pending', member, '/documents')).toBe('/documents');
    expect(guardTarget('pending', base, '/welcome')).toBe('/welcome');
  });

  it('экраны компании без компании уводят туда, куда ведёт /me', () => {
    expect(guardTarget('company', member, '/documents')).toBeNull();
    expect(guardTarget('company', inSandbox, '/documents')).toBeNull();
    expect(guardTarget('company', base, '/welcome')).toBe('/welcome');
  });
});
