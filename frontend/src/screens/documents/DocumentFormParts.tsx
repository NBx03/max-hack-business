import { Input, Textarea, Typography } from '@maxhub/max-ui';
import type { CSSProperties, ReactNode } from 'react';
import type { DocumentTypeField } from '../../api/types';
import { fieldHint } from './fieldHints';
import { Button, Loading, Page, PageHeader } from '../../ui';

export { Notice } from '../../ui';

export const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

/** Карточка-группа — то же, что ds-card дизайн-системы: подложка без рамки и цветных полос (принцип 8). */
export const sectionStyle: CSSProperties = {
  ...stackStyle,
  padding: 'var(--ds-space-m)',
  borderRadius: 'var(--ds-radius-m)',
  background: 'var(--ds-surface)',
};

export const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

/** Подпись поля формы — одна на все экраны документов. */
export const labelStyle: CSSProperties = { fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' };

/** Ссылка на источник правила: цвет из темы, иначе браузерный синий нечитаем в тёмной теме. */
export const linkStyle: CSSProperties = { color: 'var(--text-themed)' };

/**
 * Экран на каркасе дизайн-системы (ui/Page): шапка с «‹ Куда» и заголовком, контент прокручивается, главное
 * действие — в закреплённой нижней панели (LAY-1). Нижнего меню разделов больше нет (NAV-1): путь домой — «‹ Главная».
 */
export function DocumentScreen({
  title,
  subtitle,
  children,
  footer,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <Page header={<PageHeader title={title} subtitle={subtitle} back={back} />} footer={footer}>
      {children}
    </Page>
  );
}

export function LoadingState({ label = 'Загружаем…' }: { label?: string }) {
  return (
    <Page center>
      <Loading label={label} />
    </Page>
  );
}

export function FieldInputs({
  definitions,
  values,
  onChange,
  typeCode,
}: {
  definitions: DocumentTypeField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  /** Код типа — для подсказок-примеров (fieldHints.ts); подсказки справочника — для модели, не для людей. */
  typeCode?: string;
}) {
  if (definitions.length === 0) {
    return <Typography.Text>Для этого типа нет полей для ручного ввода.</Typography.Text>;
  }
  return (
    <div style={stackStyle}>
      {definitions.map((field) => (
        <label style={fieldStyle} key={field.name}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>{field.label}</span>
          {MULTILINE_FIELDS.has(field.name) ? (
            <>
              <Textarea
                rows={6}
                value={values[field.name] ?? ''}
                onChange={(event) => onChange(field.name, event.target.value)}
                maxLength={10_000}
              />
              {fieldHint(typeCode, field.name) && (
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fieldHint(typeCode, field.name)}</span>
              )}
            </>
          ) : (
            <Input
              size="large"
              inputMode={field.type === 'NUMBER' ? 'numeric' : 'text'}
              value={values[field.name] ?? ''}
              onChange={(event) => onChange(field.name, event.target.value)}
              maxLength={10_000}
              hint={fieldHint(typeCode, field.name)}
            />
          )}
        </label>
      ))}
    </div>
  );
}

/** Поля с текстом в несколько абзацев: текст служебной записки в одну строку не набрать (#59). */
const MULTILINE_FIELDS: ReadonlySet<string> = new Set(['body']);

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
    <Button stretched type="submit" form={form} variant="primary" loading={busy} disabled={disabled}>
      {children}
    </Button>
  );
}
