import { Button, Switch, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { disableMember, getMembers, getRoles, setMemberAdmin, setMemberRoles } from '../../api/admin';
import { ApiError } from '../../api/errors';
import type { MemberView, RoleRef } from '../../api/types';
import { BottomSheet } from '../../components/base/BottomSheet';
import { RolePicker } from '../../components/base/RolePicker';
import { ErrorState } from '../../components/base/StateCard';
import { Toast } from '../../components/base/Toast';
import { DocumentScreen as AdminScreen, LoadingState, Notice, stackStyle } from '../documents/DocumentFormParts';
import { AdminTabs, roleNames } from './AdminFormParts';

const FALLBACK_ERROR = 'Сервис временно недоступен, попробуйте ещё раз';

export function MembersScreen() {
  const { me } = useSession();
  const [members, setMembers] = useState<MemberView[] | null>(null);
  const [roles, setRoles] = useState<RoleRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<MemberView | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<number[]>([]);
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [memberList, roleList] = await Promise.all([getMembers(), getRoles()]);
      setMembers(memberList);
      setRoles(roleList);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : FALLBACK_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Администратор не может изменить свои собственные роли и права (CLAUDE.md, «Собственные
  // роли») - строку не делаем кликабельной вовсе, вместо показа кнопки, которую нельзя
  // нажать (docs/SCREENS.md, «Общие правила»).
  const selfUserId = me?.actingAs ? me.actingAs.user.id : me?.user.id;

  function openEdit(member: MemberView) {
    setEditing(member);
    setEditRoleIds(member.roles.map((role) => role.id));
    setEditIsAdmin(member.isAdmin);
    setEditError(null);
  }

  function applyUpdate(updated: MemberView) {
    setMembers((current) => (current ?? []).map((member) => (member.memberId === updated.memberId ? updated : member)));
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setEditError(null);
    try {
      await setMemberRoles(editing.memberId, editRoleIds);
      const updated = await setMemberAdmin(editing.memberId, editIsAdmin);
      applyUpdate(updated);
      setEditing(null);
      setToast('Изменения сохранены');
    } catch (error) {
      setEditError(error instanceof ApiError ? error.message : FALLBACK_ERROR);
    } finally {
      setSaving(false);
    }
  }

  async function disable() {
    if (!editing) return;
    setDisabling(true);
    setEditError(null);
    try {
      const updated = await disableMember(editing.memberId);
      applyUpdate(updated);
      setEditing(null);
      setToast('Участник отключён');
    } catch (error) {
      setEditError(error instanceof ApiError ? error.message : FALLBACK_ERROR);
    } finally {
      setDisabling(false);
    }
  }

  const sortedMembers = useMemo(
    () => members?.slice().sort((left, right) => left.user.fullName.localeCompare(right.user.fullName, 'ru')) ?? [],
    [members],
  );

  if (loading) return <LoadingState />;
  if (loadError || !members) {
    return (
      <AdminScreen title="Участники">
        <ErrorState message={loadError ?? FALLBACK_ERROR} onRetry={() => void load()} />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title="Участники">
      <div style={{ marginTop: 12, marginBottom: 20 }}>
        <AdminTabs active="members" />
      </div>

      <div style={stackStyle}>
        {sortedMembers.map((member) => {
          const disabledMember = member.status === 'DISABLED';
          const isSelf = member.user.id === selfUserId;
          const editable = !disabledMember && !isSelf;
          return (
            <button
              key={member.memberId}
              type="button"
              onClick={() => editable && openEdit(member)}
              disabled={!editable}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                width: '100%',
                textAlign: 'left',
                padding: '14px 16px',
                borderRadius: 12,
                border: '1px solid var(--divider-primary)',
                background: disabledMember ? 'var(--background-tertiary)' : 'var(--background-secondary)',
                color: 'var(--text-primary)',
                cursor: editable ? 'pointer' : 'default',
                opacity: disabledMember ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <strong>{member.user.fullName}</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  {member.isAdmin && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--icon-primary)', color: 'var(--text-primary-inverse)' }}>
                      Администратор
                    </span>
                  )}
                  {disabledMember && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--background-tertiary)', color: 'var(--text-tertiary)' }}>
                      Отключён
                    </span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{roleNames(member.roles)}</span>
            </button>
          );
        })}
      </div>

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.user.fullName ?? ''}>
        <div style={stackStyle}>
          <RolePicker roles={roles} selectedRoleIds={editRoleIds} onChange={setEditRoleIds} disabled={saving || disabling} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={editIsAdmin} disabled={saving || disabling} onChange={(event) => setEditIsAdmin(event.target.checked)} />
            <Typography.Text>Права администратора</Typography.Text>
          </label>
          {editError && <Notice tone="danger">{editError}</Notice>}
          <Button stretched variant="primary" loading={saving} disabled={saving || disabling} onClick={() => void save()}>
            Сохранить
          </Button>
          <Button stretched variant="destructive" loading={disabling} disabled={saving || disabling} onClick={() => void disable()}>
            Отключить участника
          </Button>
        </div>
      </BottomSheet>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AdminScreen>
  );
}
