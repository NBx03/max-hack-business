import { Button, Input, Spinner, Typography } from '@maxhub/max-ui';
import type { CSSProperties, ReactNode } from 'react';
import type { DocumentTypeField } from '../../api/types';
import { BottomActionBar, CenteredColumn, FullscreenCenter, ScreenShell } from '../../components/base/Layout';

export const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

export const sectionStyle: CSSProperties = {
  ...stackStyle,
  padding: 16,
  border: '1px solid var(--divider-primary)',
  borderRadius: 12,
  background: 'var(--background-secondary)',
};

export const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '10px 12px',
  border: '1px solid var(--divider-primary)',
  borderRadius: 8,
  background: 'var(--background-primary)',
  color: 'var(--text-primary)',
  font: 'inherit',
  boxSizing: 'border-box',
};

/** Подпись поля формы — одна на все экраны документов. */
export const labelStyle: CSSProperties = { fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' };

/** Ссылка на источник правила: цвет из темы, иначе браузерный синий нечитаем в тёмной теме. */
export const linkStyle: CSSProperties = { color: 'var(--text-themed)' };

/**
 * Экран документа: заголовок и содержимое в колонке, главное действие — в нижней панели.
 * Панель стоит рядом с колонкой, а не внутри неё: у BottomActionBar своя колонка, и внутри
 * чужой отступы удваивались — кнопка съезжала вправо (components/base/Layout.tsx).
 */
export function DocumentScreen({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <ScreenShell>
      <CenteredColumn
        style={{ ...stackStyle, flex: 1, padding: '20px 16px 16px', color: 'var(--text-primary)' }}
      >
        <Typography.Headline variant="large-strong">{title}</Typography.Headline>
        {children}
      </CenteredColumn>
      {footer && <BottomActionBar>{footer}</BottomActionBar>}
    </ScreenShell>
  );
}

export function LoadingState({ label = 'Загрузка' }: { label?: string }) {
  return (
    <FullscreenCenter>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} role="status">
        <Spinner />
        <Typography.Text>{label}</Typography.Text>
      </div>
    </FullscreenCenter>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'danger' | 'success'; children: ReactNode }) {
  const accent = tone === 'danger'
    ? 'var(--status-danger-fg)'
    : tone === 'success'
      ? 'var(--status-success-fg)'
      : 'var(--status-progress-fg)';
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      style={{
        padding: '12px 14px',
        border: '1px solid var(--divider-primary)',
        borderLeft: `4px solid ${accent}`,
        borderRadius: 8,
        background: 'var(--background-secondary)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </div>
  );
}

export function FieldInputs({
  definitions,
  values,
  onChange,
}: {
  definitions: DocumentTypeField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  if (definitions.length === 0) {
    return <Typography.Text>Для этого типа нет полей для ручного ввода.</Typography.Text>;
  }
  return (
    <div style={stackStyle}>
      {definitions.map((field) => (
        <label style={fieldStyle} key={field.name}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>{field.label}</span>
          <Input
            size="large"
            inputMode={field.type === 'NUMBER' ? 'numeric' : 'text'}
            value={values[field.name] ?? ''}
            onChange={(event) => onChange(field.name, event.target.value)}
            maxLength={10_000}
            hint={field.hint || undefined}
          />
        </label>
      ))}
    </div>
  );
}

/** `form` — id формы: кнопка стоит в нижней панели, вне самой формы. */
export function SubmitButton({
  busy,
  disabled,
  form,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  form?: string;
  children: ReactNode;
}) {
  return (
    <Button stretched type="submit" form={form} variant="primary" size="large" loading={busy} disabled={busy || disabled}>
      {children}
    </Button>
  );
}
