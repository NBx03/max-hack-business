import { Button, Switch, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useState } from 'react';
import { approveJoinRequest, getJoinRequests, getRoles, rejectJoinRequest } from '../../api/admin';
import { ApiError } from '../../api/errors';
import type { JoinRequestView, RoleRef } from '../../api/types';
import { RolePicker } from '../../components/base/RolePicker';
import { EmptyState, ErrorState } from '../../components/base/StateCard';
import { Toast } from '../../components/base/Toast';
import { DocumentScreen as AdminScreen, LoadingState, Notice, sectionStyle, stackStyle } from '../documents/DocumentFormParts';
import { AdminTabs, formatDateTime } from './AdminFormParts';

const FALLBACK_ERROR = 'Сервис временно недоступен, попробуйте ещё раз';

interface RowChoice {
  roleIds: number[];
  isAdmin: boolean;
}

export function JoinRequestsScreen() {
  const [requests, setRequests] = useState<JoinRequestView[] | null>(null);
  const [roles, setRoles] = useState<RoleRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setChoices(Object.fromEntries(requestList.map((request) => [request.id, { roleIds: [], isAdmin: false }])));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : FALLBACK_ERROR);
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

  async function approve(request: JoinRequestView) {
    const choice = choices[request.id] ?? { roleIds: [], isAdmin: false };
    setBusyId(request.id);
    setRowErrors((current) => ({ ...current, [request.id]: '' }));
    try {
      await approveJoinRequest(request.id, choice.roleIds, choice.isAdmin);
      removeRequest(request.id);
      setToast(`Заявка «${request.user.fullName}» принята`);
    } catch (error) {
      setRowErrors((current) => ({
        ...current,
        [request.id]: error instanceof ApiError ? error.message : FALLBACK_ERROR,
      }));
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
      setRowErrors((current) => ({
        ...current,
        [request.id]: error instanceof ApiError ? error.message : FALLBACK_ERROR,
      }));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (loadError || !requests) {
    return (
      <AdminScreen title="Заявки">
        <ErrorState message={loadError ?? FALLBACK_ERROR} onRetry={() => void load()} />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title="Заявки">
      <div style={{ marginTop: 12, marginBottom: 20 }}>
        <AdminTabs active="requests" requestsCount={requests.length} />
      </div>

      {requests.length === 0 ? (
        <EmptyState text="Новых заявок нет" />
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
