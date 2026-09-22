import { useState } from 'react';
import type { RoleRef } from '../../api/types';

// Выбор ролей чипами - один компонент для заявок, участников и личных ссылок
// (docs/SCREENS.md, "Роли выбираются одним компонентом везде"; макет
// experiment-role-picker-plus-button). «Права администратора» сюда не входит -
// это отдельный Switch на экране, роли и права администратора не одно и то же.

export function RolePicker({
  roles,
  selectedRoleIds,
  onChange,
  label,
  disabled,
}: {
  /** Все роли компании, из которых можно выбирать. */
  roles: RoleRef[];
  selectedRoleIds: number[];
  onChange: (roleIds: number[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const selectedRoles = roles.filter((role) => selectedRoleIds.includes(role.id));
  const availableRoles = roles.filter((role) => !selectedRoleIds.includes(role.id));

  function addRole(roleId: number) {
    onChange([...selectedRoleIds, roleId]);
    setPopoverOpen(false);
  }

  function removeRole(roleId: number) {
    onChange(selectedRoleIds.filter((id) => id !== roleId));
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 16,
        border: '1px solid var(--divider-primary)',
        borderRadius: 12,
        position: 'relative',
      }}
    >
      {label && (
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: 'var(--text-tertiary)' }}>
          {label}
        </span>
      )}

      {selectedRoles.length === 0 ? (
        <button
          type="button"
          disabled={disabled || availableRoles.length === 0}
          onClick={() => setPopoverOpen((prev) => !prev)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            padding: '7px 14px',
            borderRadius: 18,
            border: '1px dashed var(--divider-primary)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 500,
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          <span style={{ fontWeight: 600 }}>+</span> Добавить роль
        </button>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {selectedRoles.map((role) => (
            <span
              key={role.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px 6px 12px',
                borderRadius: 16,
                background: 'var(--background-secondary)',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              {role.name}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Убрать роль «${role.name}»`}
                  onClick={() => removeRole(role.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {!disabled && availableRoles.length > 0 && (
            <button
              type="button"
              aria-label="Добавить роль"
              onClick={() => setPopoverOpen((prev) => !prev)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                border: popoverOpen ? 'none' : '1px solid var(--divider-primary)',
                background: popoverOpen ? 'var(--icon-primary)' : 'transparent',
                color: popoverOpen ? 'var(--text-primary-inverse)' : 'var(--text-primary)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              +
            </button>
          )}
        </div>
      )}

      {popoverOpen && availableRoles.length > 0 && (
        <>
          {/* Клик вне списка закрывает его - без библиотеки попапов достаточно одного перехватчика. */}
          <div
            onClick={() => setPopoverOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 11,
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid var(--divider-primary)',
              borderRadius: 10,
              background: 'var(--background-primary)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
              padding: '8px 12px',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', padding: '8px 4px' }}>
              Доступные роли
            </span>
            {availableRoles.map((role, index) => (
              <div key={role.id}>
                {index > 0 && <div style={{ height: 1, background: 'var(--divider-secondary)' }} />}
                <button
                  type="button"
                  onClick={() => addRole(role.id)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 4px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {role.name}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      border: '1px solid var(--divider-primary)',
                      fontSize: 14,
                    }}
                  >
                    +
                  </span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
