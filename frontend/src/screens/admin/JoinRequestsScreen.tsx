import { Switch, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useState } from 'react';
import { approveJoinRequest, getJoinRequests, getRoles, rejectJoinRequest } from '../../api/admin';
import { ApiError, errorMessage } from '../../api/errors';
import type { JoinRequestView, RoleRef } from '../../api/types';
import { RolePicker } from '../../components/base/RolePicker';
import { EmptyState, Button, Toast } from '../../ui';
import { DocumentScreen as AdminScreen, LoadingState, Notice, sectionStyle, stackStyle } from '../documents/DocumentFormParts';
import { ADMIN_BACK, AdminLoadError, formatDateTime } from './AdminFormParts';

interface RowChoice {
  roleIds: number[];
  isAdmin: boolean;
}

export function JoinRequestsScreen() {
  const [requests, setRequests] = useState<JoinRequestView[] | null>(null);
  const [roles, setRoles] = useState<RoleRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [choices, setChoices] = useState<Record<number, RowChoice>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [requestList, roleList] = await Promise.all([getJoinRequests(), getRoles()]);
      setRequests(requestList);
      setRoles(roleList);
      // Вернувшемуся сотруднику прежние роли отмечены заранее (D5): администратору остаётся «Принять».
      const known = new Set(roleList.map((role) => role.id));
      setChoices(Object.fromEntries(requestList.map((request) => [
        request.id,
        { roleIds: (request.previousRoles ?? []).map((role) => role.id).filter((id) => known.has(id)), isAdmin: false },
      ])));
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setChoice(requestId: number, patch: Partial<RowChoice>) {
    setChoices((current) => ({ ...current, [requestId]: { ...current[requestId], ...patch } }));
  }

  function removeRequest(requestId: number) {
    setRequests((current) => (current ?? []).filter((request) => request.id !== requestId));
  }

  /**
   * Заявку уже решил другой администратор (409 INVALID_STATE) - строка в списке устарела,
   * а не временно недоступна. Убираем её и показываем тостом текст бэкенда, а не оставляем
   * висеть с ошибкой (PR #72, ревью №6). Остальные ошибки (сеть, 403) - в строке как раньше.
   */
  function handleRowError(request: JoinRequestView, error: unknown) {
    if (error instanceof ApiError && error.status === 409) {
      removeRequest(request.id);
      setToast(error.message);
      return;
    }
    setRowErrors((current) => ({
      ...current,
      [request.id]: errorMessage(error),
    }));
  }

  async function approve(request: JoinRequestView) {
    const choice = choices[request.id] ?? { roleIds: [], isAdmin: false };
    setBusyId(request.id);
    setRowErrors((current) => ({ ...current, [request.id]: '' }));
    try {
      await approveJoinRequest(request.id, choice.roleIds, choice.isAdmin);
      removeRequest(request.id);
      setToast(`Заявка «${request.user.fullName}» принята`);
    } catch (error) {
      handleRowError(request, error);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(request: JoinRequestView) {
    setBusyId(request.id);
    setRowErrors((current) => ({ ...current, [request.id]: '' }));
    try {
      await rejectJoinRequest(request.id);
      removeRequest(request.id);
      setToast(`Заявка «${request.user.fullName}» отклонена`);
    } catch (error) {
      handleRowError(request, error);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (loadError !== null || !requests) {
    return (
      <AdminScreen title="Заявки" back={ADMIN_BACK}>
        <AdminLoadError error={loadError} onRetry={() => void load()} />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title="Заявки" back={ADMIN_BACK}>

      {requests.length === 0 ? (
        // LNK-4: пришло сообщение о заявке, а здесь пусто — значит, её уже решил другой администратор или отозвал сам
        // человек. Говорим это прямо, а не оставляем гадать.
        <EmptyState
          title="Новых заявок нет"
          text="Когда сотрудник подаст заявку по коду компании, она появится здесь, а бот пришлёт вам сообщение. Если сообщение пришло, а заявки нет — её уже рассмотрел другой администратор или отозвал сам сотрудник."
        />
      ) : (
        <div style={stackStyle}>
          {requests.map((request) => {
            const choice = choices[request.id] ?? { roleIds: [], isAdmin: false };
            const busy = busyId === request.id;
            const canApprove = choice.roleIds.length > 0 || choice.isAdmin;
            return (
              <section key={request.id} style={sectionStyle}>
                <div>
                  <strong>{request.user.fullName}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Подана {formatDateTime(request.createdAt)}
                  </div>
                </div>

                {(request.previousRoles ?? []).length > 0 && (
                  <p className="ds-section__hint" style={{ margin: 0 }}>
                    Возвращается в компанию — отмечены прежние роли: {request.previousRoles.map((role) => role.name).join(', ')}.
                  </p>
                )}

                <RolePicker
                  roles={roles}
                  selectedRoleIds={choice.roleIds}
                  onChange={(roleIds) => setChoice(request.id, { roleIds })}
                  disabled={busy}
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Switch
                    checked={choice.isAdmin}
                    disabled={busy}
                    onChange={(event) => setChoice(request.id, { isAdmin: event.target.checked })}
                  />
                  <Typography.Text>Права администратора</Typography.Text>
                </label>

                {!canApprove && (
                  // Почему «Принять» недоступна — рядом с ней, а не догадкой (принцип 9).
                  <p className="ds-section__hint" style={{ margin: 0 }}>Чтобы принять, отметьте роль или права администратора.</p>
                )}

                {rowErrors[request.id] && <Notice tone="danger">{rowErrors[request.id]}</Notice>}

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Button
                      stretched
                      variant="primary"
                      loading={busy}
                      disabled={busy || !canApprove}
                      onClick={() => void approve(request)}
                    >
                      Принять
                    </Button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Button stretched variant="secondary" disabled={busy} onClick={() => void reject(request)}>
                      Отклонить
                    </Button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AdminScreen>
  );
}
