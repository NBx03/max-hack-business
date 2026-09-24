import { Button, Switch, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { disableMember, getMembers, getRoles, setMemberAdmin, setMemberRoles } from '../../api/admin';
import { errorMessage } from '../../api/errors';
import type { MemberView, RoleRef } from '../../api/types';
import { BottomSheet, ConfirmSheet } from '../../components/base/BottomSheet';
import { RolePicker } from '../../components/base/RolePicker';
import { Toast } from '../../components/base/Toast';
import { DocumentScreen as AdminScreen, LoadingState, Notice, stackStyle } from '../documents/DocumentFormParts';
import { ADMIN_BACK, AdminLoadError, AdminTabs, roleNames } from './AdminFormParts';

function sameRoleIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

export function MembersScreen() {
  const { me } = useSession();
  const [members, setMembers] = useState<MemberView[] | null>(null);
  const [roles, setRoles] = useState<RoleRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [editing, setEditing] = useState<MemberView | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<number[]>([]);
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
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
      setLoadError(error);
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

  function closeEdit() {
    setEditing(null);
    setConfirmDisable(false);
    setEditError(null);
  }

  function applyUpdate(updated: MemberView) {
    setMembers((current) => (current ?? []).map((member) => (member.memberId === updated.memberId ? updated : member)));
  }

  /**
   * Только изменившиеся поля, каждое отдельным запросом (PR #72, ревью №2): роли и права
   * администратора - независимые эндпоинты, и при ошибке после частичного успеха (роли
   * сохранились, права упали на LAST_ADMIN) список должен показывать правду с сервера,
   * а не то, что мы пытались отправить. Перечитываем список тихо, без общего LoadingState -
   * иначе исчез бы сам открытый лист вместе с текстом ошибки.
   */
  async function save() {
    if (!editing) return;
    const rolesChanged = !sameRoleIds(editRoleIds, editing.roles.map((role) => role.id));
    const adminChanged = editIsAdmin !== editing.isAdmin;
    if (!rolesChanged && !adminChanged) {
      closeEdit();
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      if (rolesChanged) {
        applyUpdate(await setMemberRoles(editing.memberId, editRoleIds));
      }
      if (adminChanged) {
        applyUpdate(await setMemberAdmin(editing.memberId, editIsAdmin));
      }
      closeEdit();
      setToast('Изменения сохранены');
    } catch (error) {
      try {
        const fresh = await getMembers();
        setMembers(fresh);
        const stillThere = fresh.find((member) => member.memberId === editing.memberId);
        if (stillThere) {
          // Поля листа — тоже со свежих данных: иначе после ошибки лист показывал бы то, что
          // пытались отправить, поверх того, что реально сохранено (ревью #72).
          setEditing(stillThere);
          setEditRoleIds(stillThere.roles.map((role) => role.id));
          setEditIsAdmin(stillThere.isAdmin);
        }
      } catch {
        // Не удалось обновить список - хотя бы покажем ошибку сохранения ниже.
      }
      setEditError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function disable() {
    if (!editing || disabling) return;
    setDisabling(true);
    setEditError(null);
    try {
      const updated = await disableMember(editing.memberId);
      applyUpdate(updated);
      setConfirmDisable(false);
      closeEdit();
      setToast('Сотрудник исключён');
    } catch (error) {
      setConfirmDisable(false);
      setEditError(errorMessage(error));
    } finally {
      setDisabling(false);
    }
  }

  const sortedMembers = useMemo(
    () => members?.slice().sort((left, right) => left.user.fullName.localeCompare(right.user.fullName, 'ru')) ?? [],
    [members],
  );
  // Исключённые — отдельно и внизу (приёмка 24.09, п. 15): запись остаётся ради истории решений и чтобы
  // вернувшийся по заявке человек занял прежнее место, но в общем списке она путала.
  const activeMembers = sortedMembers.filter((member) => member.status !== 'DISABLED');
  const excludedMembers = sortedMembers.filter((member) => member.status === 'DISABLED');

  if (loading) return <LoadingState />;
  if (loadError !== null || !members) {
    return (
      <AdminScreen title="Участники" back={ADMIN_BACK} nav>
        <AdminLoadError error={loadError} onRetry={() => void load()} />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title="Участники" back={ADMIN_BACK} nav>
      <div style={{ marginTop: 12, marginBottom: 20 }}>
        <AdminTabs active="members" />
      </div>

      <div style={stackStyle}>
        {activeMembers.map((member) => {
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
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{roleNames(member.roles)}</span>
            </button>
          );
        })}
      </div>

      {excludedMembers.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14 }}>
            Исключённые · {excludedMembers.length}
          </summary>
          <div style={{ ...stackStyle, gap: 6, marginTop: 10 }}>
            {excludedMembers.map((member) => (
              <span key={member.memberId} style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
                {member.user.fullName}
              </span>
            ))}
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Вернуться может по коду компании или личной ссылке — займёт прежнее место.
            </span>
          </div>
        </details>
      )}

      <BottomSheet
        open={editing !== null}
        onClose={closeEdit}
        title={editing?.user.fullName ?? ''}
        dismissible={!saving && !disabling}
      >
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
          <Button stretched variant="destructive" disabled={saving || disabling} onClick={() => setConfirmDisable(true)}>
            Исключить из компании
          </Button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={confirmDisable}
        onClose={() => setConfirmDisable(false)}
        title={`Исключить «${editing?.user.fullName ?? ''}»?`}
        description="Доступ к документам компании закроется сразу. Документы, которые ждут его решения, вернутся авторам — их можно отправить заново."
        confirmLabel="Исключить"
        destructive
        busy={disabling}
        onConfirm={() => void disable()}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AdminScreen>
  );
}
