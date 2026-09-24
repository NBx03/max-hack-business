import { Button, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useState } from 'react';
import {
  createPersonalInvite,
  getInviteCode,
  getMembers,
  getPersonalInvites,
  getRoles,
  regenerateInviteCode,
  revokePersonalInvite,
} from '../../api/admin';
import { errorMessage } from '../../api/errors';
import type { InviteCodeInfo, PersonalInviteView, RoleRef } from '../../api/types';
import { BottomSheet, ConfirmSheet } from '../../components/base/BottomSheet';
import { RolePicker } from '../../components/base/RolePicker';
import { Toast } from '../../components/base/Toast';
import { copyToClipboard, shareOrCopy } from '../../lib/share';
import { DocumentScreen as AdminScreen, LoadingState, Notice, sectionStyle, stackStyle } from '../documents/DocumentFormParts';
import { ADMIN_BACK, AdminLoadError, AdminTabs, formatTimeLeft, roleNames } from './AdminFormParts';

export function InviteScreen() {
  const [code, setCode] = useState<InviteCodeInfo | null>(null);
  const [roles, setRoles] = useState<RoleRef[]>([]);
  const [personalInvites, setPersonalInvites] = useState<PersonalInviteView[] | null>(null);
  // Экран 2 (SCREENS.md): подсказка «Пригласите сотрудников…», пока администратор один -
  // #64 ведёт создателя компании прямо сюда, а не на отдельный экран (PR #72, ревью №4).
  const [soloAdmin, setSoloAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newRoleIds, setNewRoleIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Заполнен после успешного создания - лист остаётся открытым с готовой ссылкой и
  // «Поделиться», а не закрывается сразу (SCREENS.md: «→ ссылка и «Поделиться»»; PR #72, №7).
  const [createdInvite, setCreatedInvite] = useState<PersonalInviteView | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [codeInfo, roleList, memberList] = await Promise.all([getInviteCode(), getRoles(), getMembers()]);
      setCode(codeInfo);
      setRoles(roleList);
      setSoloAdmin(memberList.length === 1);
      // Личные ссылки - SHOULD: если недоступны (эндпоинта нет в этой сборке),
      // основной блок «Код компании» всё равно должен показаться.
      try {
        setPersonalInvites(await getPersonalInvites());
      } catch {
        setPersonalInvites(null);
      }
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function share(url: string, label: string) {
    const result = await shareOrCopy(url, label);
    if (result === 'copied') setToast('Ссылка скопирована');
    if (result === 'failed') setActionError('Не удалось поделиться ссылкой');
  }

  async function copyCode() {
    if (!code) return;
    if (await copyToClipboard(code.code)) {
      setToast('Код скопирован');
    } else {
      setActionError('Не удалось скопировать код');
    }
  }

  async function regenerate() {
    // ConfirmSheet не блокирует свою кнопку по loading - защита от повторного тапа здесь.
    if (regenerating) return;
    setRegenerating(true);
    setActionError(null);
    try {
      setCode(await regenerateInviteCode());
      setConfirmRegenerate(false);
      setToast('Код перевыпущен');
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setRegenerating(false);
    }
  }

  async function createLink() {
    if (newRoleIds.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createPersonalInvite(newRoleIds);
      setPersonalInvites((current) => [created, ...(current ?? [])]);
      setCreatedInvite(created);
      setNewRoleIds([]);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  function closeCreateSheet() {
    setCreateOpen(false);
    setCreatedInvite(null);
    setCreateError(null);
  }

  async function revoke(invite: PersonalInviteView) {
    setActionError(null);
    try {
      await revokePersonalInvite(invite.id);
      setPersonalInvites((current) => (current ?? []).filter((item) => item.id !== invite.id));
      setToast('Ссылка отозвана');
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  if (loading) return <LoadingState />;
  if (loadError !== null || !code) {
    return (
      <AdminScreen title="Приглашение" back={ADMIN_BACK} nav>
        <AdminLoadError error={loadError} onRetry={() => void load()} />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title="Приглашение" back={ADMIN_BACK} nav>
      <div style={{ marginTop: 12, marginBottom: 20 }}>
        <AdminTabs active="invite" />
      </div>
      <div style={{ ...stackStyle, marginTop: 4 }}>
        {soloAdmin && (
          <Notice>
            Перешлите сотрудникам код или ссылку. Пока их нет, за директора согласуете вы — автоматически.
          </Notice>
        )}

        <section style={sectionStyle}>
          <Typography.Headline variant="medium">Код компании</Typography.Headline>
          <Typography.Display style={{ letterSpacing: 2 }}>{code.code}</Typography.Display>
          <Typography.Text style={{ color: 'var(--text-tertiary)', overflowWrap: 'anywhere' }}>
            {code.link}
          </Typography.Text>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Button stretched onClick={() => void share(code.link, 'Приглашение в компанию')}>Поделиться</Button>
            </div>
            <div style={{ flex: 1 }}>
              <Button stretched variant="secondary" onClick={() => void copyCode()}>Скопировать код</Button>
            </div>
          </div>
          <Button variant="secondary" onClick={() => setConfirmRegenerate(true)}>Перевыпустить код</Button>
        </section>

        {actionError && <Notice tone="danger">{actionError}</Notice>}

        {personalInvites !== null && (
          <section style={sectionStyle}>
            {/* Заголовок и кнопка в одну строку на телефоне не помещались: кнопка обрезалась
                до «Создать сс…» (тест 23.09). Столбиком, с пояснением, что это за ссылка. */}
            <div style={{ ...stackStyle, gap: 6 }}>
              <Typography.Headline variant="medium">Личные приглашения</Typography.Headline>
              <Typography.Text style={{ color: 'var(--text-secondary)' }}>
                Одноразовая ссылка на 72 часа с заранее выбранными ролями — человек вступит без заявки.
              </Typography.Text>
            </div>
            <Button variant="secondary" onClick={() => setCreateOpen(true)} disabled={roles.length === 0}>
              Создать личную ссылку
            </Button>
            {personalInvites.length === 0 ? (
              <Typography.Text style={{ color: 'var(--text-tertiary)' }}>
                Активных личных ссылок нет.
              </Typography.Text>
            ) : (
              <div style={stackStyle}>
                {personalInvites.map((invite) => (
                  <div
                    key={invite.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      padding: '10px 0',
                      borderBottom: '1px solid var(--divider-primary)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{roleNames(invite.roles)}</strong>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {formatTimeLeft(invite.expiresAt)}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', overflowWrap: 'anywhere' }}>
                      {invite.link}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="small" variant="secondary" onClick={() => void share(invite.link, 'Личное приглашение в компанию')}>
                        Поделиться
                      </Button>
                      <Button size="small" variant="secondary" onClick={() => void revoke(invite)}>Отозвать</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <ConfirmSheet
        open={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        title="Перевыпустить код?"
        description="Старый код перестанет работать. Уже поданные заявки останутся."
        confirmLabel="Перевыпустить"
        busy={regenerating}
        onConfirm={() => void regenerate()}
      />

      <BottomSheet open={createOpen} onClose={closeCreateSheet} title="Личная ссылка" dismissible={!creating}>
        {createdInvite ? (
          <div style={stackStyle}>
            <Notice tone="success">Ссылка создана: {roleNames(createdInvite.roles)}</Notice>
            <Typography.Text style={{ overflowWrap: 'anywhere', color: 'var(--text-tertiary)' }}>
              {createdInvite.link}
            </Typography.Text>
            <Button stretched onClick={() => void share(createdInvite.link, 'Личное приглашение в компанию')}>
              Поделиться
            </Button>
            <Button stretched variant="secondary" onClick={closeCreateSheet}>Готово</Button>
          </div>
        ) : (
          <div style={stackStyle}>
            <RolePicker roles={roles} selectedRoleIds={newRoleIds} onChange={setNewRoleIds} disabled={creating} />
            <Notice>Вступит тот, кто откроет первым. Отправляйте только в личные сообщения.</Notice>
            {createError && <Notice tone="danger">{createError}</Notice>}
            <Button
              stretched
              variant="primary"
              loading={creating}
              disabled={creating || newRoleIds.length === 0}
              onClick={() => void createLink()}
            >
              Создать
            </Button>
          </div>
        )}
      </BottomSheet>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AdminScreen>
  );
}
