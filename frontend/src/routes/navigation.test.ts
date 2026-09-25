import { describe, expect, it } from 'vitest';
import type { MeResponse } from '../api/types';
import { launchDataFromHash, launchDataToReloadFor, relaunchMark, startParamOf } from '../app/launch';
import { parentRoute } from './backNavigation';
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
  it('без компании и ссылки - приветствие, с компанией - главная', () => {
    expect(resolveEntryRoute(base)).toBe('/welcome');
    expect(resolveEntryRoute(member)).toBe('/home');
  });

  it('проверяющий в песочнице - к документам, хотя реальной компании нет', () => {
    expect(resolveEntryRoute(inSandbox)).toBe('/home');
  });

  it('песочница есть, но участник не выбран - приветствие («Вернуться в демо»)', () => {
    expect(resolveEntryRoute({ ...inSandbox, actingAs: null })).toBe('/welcome');
  });

  it('ссылки c_, p_, d_ ведут на свои экраны', () => {
    expect(resolveEntryRoute({ ...base, startParam: 'c_KX7M2PQR' })).toBe('/join?code=KX7M2PQR');
    expect(resolveEntryRoute({ ...base, startParam: 'p_token' })).toBe('/join/personal/token');
    expect(resolveEntryRoute({ ...member, startParam: 'd_5' })).toBe('/documents/5');
  });

  it('кнопки бота: s_ — результаты поиска (LNK-3), a_requests — заявки (LNK-4)', () => {
    // «записка отпуск» в base64url — так бот кладёт запрос в параметр запуска.
    expect(resolveEntryRoute({ ...member, startParam: 's_0LfQsNC_0LjRgdC60LAg0L7RgtC_0YPRgdC6' })).toBe(
      `/documents/search?q=${encodeURIComponent('записка отпуск')}`,
    );
    expect(resolveEntryRoute({ ...member, startParam: 's_%%%' })).toBe('/documents/search');
    expect(resolveEntryRoute({ ...member, startParam: 'a_requests' })).toBe('/admin/requests');
    // Без компании эти кнопки не ведут никуда особенного.
    expect(resolveEntryRoute({ ...base, startParam: 'a_requests' })).toBe('/welcome');
  });

  it('приглашение игнорируется, если человек уже в компании или ждёт решения', () => {
    expect(resolveEntryRoute({ ...member, startParam: 'c_KX7M2PQR' })).toBe('/home');
    expect(resolveEntryRoute({ ...pending, startParam: 'p_token' })).toBe('/pending');
  });

  it('отработавший startParam больше не учитывается', () => {
    expect(resolveEntryRoute({ ...member, startParam: 'd_5' }, false)).toBe('/home');
    expect(resolveEntryRoute({ ...base, startParam: 'c_KX7M2PQR' }, false)).toBe('/welcome');
  });
});

describe('guardTarget', () => {
  it('экраны подключения: компания появилась - к документам, подана заявка - к ожиданию', () => {
    expect(guardTarget('onboarding', base, '/welcome')).toBeNull();
    expect(guardTarget('onboarding', member, '/home')).toBe('/home');
    expect(guardTarget('onboarding', inSandbox, '/home')).toBe('/home');
    expect(guardTarget('onboarding', pending, '/pending')).toBe('/pending');
  });

  it('после создания компании - сразу на экран приглашения (SCREENS.md, экран 2)', () => {
    expect(guardTarget('createCompany', base, '/welcome')).toBeNull();
    expect(guardTarget('createCompany', member, '/documents')).toBe('/admin/invite');
  });

  it('ожидание решения: заявку одобрили - к документам, отменили или отклонили - по /me', () => {
    expect(guardTarget('pending', pending, '/pending')).toBeNull();
    expect(guardTarget('pending', member, '/home')).toBe('/home');
    expect(guardTarget('pending', base, '/welcome')).toBe('/welcome');
  });

  it('экраны компании без компании уводят туда, куда ведёт /me', () => {
    expect(guardTarget('company', member, '/documents')).toBeNull();
    expect(guardTarget('company', inSandbox, '/documents')).toBeNull();
    expect(guardTarget('company', base, '/welcome')).toBe('/welcome');
  });
});

describe('parentRoute — куда ведут «назад» и ссылки «‹ …»', () => {
  it('экраны документа - к карточке; карточка, списки, загрузка и «Компания» - на главную', () => {
    expect(parentRoute('/documents/5/check', '/home')).toBe('/documents/5');
    expect(parentRoute('/documents/5/route', '/home')).toBe('/documents/5');
    expect(parentRoute('/documents/5/new-version', '/home')).toBe('/documents/5');
    expect(parentRoute('/documents/5', '/home')).toBe('/home');
    expect(parentRoute('/documents/list/waiting', '/home')).toBe('/home');
    expect(parentRoute('/documents/new', '/home')).toBe('/home');
    expect(parentRoute('/documents/new/memo', '/home')).toBe('/documents/new');
    expect(parentRoute('/company', '/home')).toBe('/home');
  });

  it('администрирование - к разделу «Компания», подключение - к приветствию', () => {
    expect(parentRoute('/admin/invite', '/home')).toBe('/company');
    expect(parentRoute('/admin/members', '/home')).toBe('/company');
    expect(parentRoute('/company/rules', '/home')).toBe('/company');
    expect(parentRoute('/company/create', '/welcome')).toBe('/welcome');
    expect(parentRoute('/join', '/welcome')).toBe('/welcome');
    expect(parentRoute('/join/personal/abc', '/welcome')).toBe('/welcome');
  });

  it('у корневых экранов родителя нет - туда, куда ведёт /me', () => {
    expect(parentRoute('/home', '/home')).toBe('/home');
    expect(parentRoute('/pending', '/pending')).toBe('/pending');
  });
});

describe('launchDataFromHash — данные повторного запуска из хэша адреса', () => {
  it('достаёт WebAppData и не падает на пустом или чужом хэше', () => {
    expect(launchDataFromHash('#WebAppData=query_id%3D1&WebAppPlatform=web')).toBe('query_id=1');
    expect(launchDataFromHash('')).toBeNull();
    expect(launchDataFromHash('#section')).toBeNull();
  });
});

describe('launchDataToReloadFor', () => {
  // Повторное открытие из бота: перезагрузка — только ради новых данных запуска и только один раз (ревью #96).
  // Данные запуска в хэше закодированы целиком: новый запуск с параметром ссылки d_7.
  const hash = `#WebAppData=${encodeURIComponent('auth_date=2&start_param=d_7')}`;

  it('перезагружает ради новых данных запуска с другим параметром ссылки', () => {
    expect(launchDataToReloadFor(hash, 'old-launch', null)).not.toBeNull();
    // та же ссылка, освежённая подпись — не новый запуск
    expect(launchDataToReloadFor(hash, 'auth_date=1&start_param=d_7', null)).toBeNull();
  });

  it('не перезагружает второй раз ради той же строки — даже если мост её так и не принял', () => {
    const mark = launchDataToReloadFor(hash, 'old-launch', null);
    expect(launchDataToReloadFor(hash, 'old-launch', mark)).toBeNull();
  });

  it('ничего не делает без моста MAX и без данных в хэше', () => {
    expect(launchDataToReloadFor(hash, undefined, null)).toBeNull();
    expect(launchDataToReloadFor('', 'old-launch', null)).toBeNull();
    expect(launchDataToReloadFor('#WebAppData=same', 'same', null)).toBeNull();
  });
});

describe('relaunchMark — перезагрузка только ради нового параметра ссылки (ревью #112, п. 2)', () => {
  const launch = (param: string, authDate: number, queryId = 'q1') =>
    `query_id=${queryId}&auth_date=${authDate}${param ? `&start_param=${param}` : ''}&hash=x${authDate}`;

  it('те же данные — не перезагружаем', () => {
    expect(relaunchMark(launch('d_5', 1), launch('d_5', 1), null)).toBeNull();
  });

  it('MAX освежил подпись, параметр тот же или его нет — не перезагружаем, введённое не теряется', () => {
    expect(relaunchMark(launch('d_5', 1), launch('d_5', 2), null)).toBeNull();
    expect(relaunchMark(launch('', 1), launch('', 2), null)).toBeNull();
  });

  it('другой параметр — перезагружаем один раз', () => {
    const mark = relaunchMark(launch('d_5', 1), launch('d_7', 2), null);
    expect(mark).not.toBeNull();
    expect(relaunchMark(launch('d_5', 1), launch('d_7', 2), mark)).toBeNull();
    expect(relaunchMark(launch('', 1), launch('a_requests', 2), null)).not.toBeNull();
  });

  it('та же ссылка открыта заново (новый query_id) — перезагружаем: открыть d_5 → уйти → снова d_5', () => {
    expect(relaunchMark(launch('d_5', 1, 'q1'), launch('d_5', 2, 'q2'), null)).not.toBeNull();
    expect(relaunchMark(launch('a_requests', 1, 'q1'), launch('a_requests', 2, 'q2'), null)).not.toBeNull();
  });

  it('без query_id повторное открытие не отличить от обновления подписи — не перезагружаем', () => {
    expect(relaunchMark('auth_date=1&start_param=d_5', 'auth_date=2&start_param=d_5', null)).toBeNull();
  });

  it('пустой мост — не трогаем', () => {
    expect(relaunchMark(launch('d_5', 1), '', null)).toBeNull();
    expect(startParamOf('')).toBe('');
  });
});
