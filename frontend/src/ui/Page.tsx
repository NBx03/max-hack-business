import type { CSSProperties, ReactNode } from 'react';
import { useGoBack } from '../routes/backNavigation';
import { Icon, type IconName } from './icons';

/**
 * Каркас экрана (принцип 2, LAY-1): высота приложения равна видимой области MAX (app/viewport.ts), страница целиком
 * не прокручивается никогда. Прокручивается только область с шапкой и контентом, а действия (footer) закреплены
 * снизу с учётом safe-area и видны всегда. data-scroll-root — для scrollScreenToTop.
 */
export function Page({
  header,
  footer,
  children,
  center,
}: {
  header?: ReactNode;
  /** Закреплённые действия внизу: одна главная кнопка на всю ширину, остальные — вторичные. */
  footer?: ReactNode;
  children?: ReactNode;
  /** Контент по центру по вертикали — загрузка, ошибка, короткие экраны подключения. */
  center?: boolean;
}) {
  return (
    <div className="ds-page">
      <div className="ds-page__scroll" data-scroll-root>
        <div className="ds-page__content">
          {header}
          {center ? <div className="ds-page__center">{children}</div> : children}
        </div>
      </div>
      {footer && <div className="ds-page__footer">{footer}</div>}
    </div>
  );
}

/** Прокрутить текущий экран к началу (вместо window.scrollTo — страница сама не прокручивается). */
export function scrollScreenToTop(): void {
  document.querySelector('[data-scroll-root]')?.scrollTo({ top: 0 });
}

/**
 * Шапка экрана: «‹ Куда» (логический родитель, routes/backNavigation.ts — та же цель, что у системной кнопки
 * MAX), заголовок, подзаголовок и то, что справа от заголовка (метка статуса, меню).
 */
export function PageHeader({
  title,
  subtitle,
  back,
  aside,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { to: string; label: string };
  aside?: ReactNode;
}) {
  return (
    <header className="ds-header">
      {back && <BackLink to={back.to} label={back.label} />}
      <div className="ds-header__row">
        <h1 className="ds-header__title">{title}</h1>
        {aside}
      </div>
      {subtitle && <p className="ds-header__subtitle">{subtitle}</p>}
    </header>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  const goBack = useGoBack();
  return (
    <button type="button" className="ds-back" onClick={() => goBack(to)}>
      <Icon name="back" size={20} />
      {label}
    </button>
  );
}

/** Группа на экране: заголовок, необязательная подсказка и содержимое. */
export function Section({ title, hint, children, aside }: { title?: ReactNode; hint?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ds-section">
      {(title || aside) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {title && <h2 className="ds-section__title" style={{ flex: 1 }}>{title}</h2>}
          {aside}
        </div>
      )}
      {hint && <p className="ds-section__hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="ds-card" style={style}>
      {children}
    </div>
  );
}

/** Список строк на одной подложке. */
export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="ds-list" role="list" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * Строка списка. С onClick — кнопка со стрелкой «›» (принцип 4: кликабельное видно сразу), без — просто текст.
 */
export function Row({
  title,
  subtitle,
  before,
  after,
  onClick,
  chevron = true,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const body = (
    <>
      {before}
      <span className="ds-row__body">
        <span className="ds-row__title">{title}</span>
        {subtitle && <span className="ds-row__subtitle">{subtitle}</span>}
      </span>
      {after && <span className="ds-row__after">{after}</span>}
      {onClick && chevron && (
        <span className="ds-row__chevron">
          <Icon name="chevron" size={20} />
        </span>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className="ds-row" role="listitem" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="ds-row" role="listitem">
      {body}
    </div>
  );
}

/** Сетка плиток 2×2 главного экрана (NAV-1). */
export function Tiles({ children }: { children: ReactNode }) {
  return <div className="ds-tiles">{children}</div>;
}

/**
 * Плитка раздела: иконка, название и пояснение в одну-две строки — «что здесь за документы» (NAV-2).
 * attention — есть что сделать (например, документы ждут решения): акцентная рамка и счётчик.
 */
export function Tile({
  icon,
  title,
  hint,
  count,
  attention,
  onClick,
}: {
  icon: IconName;
  title: string;
  hint: string;
  count?: number;
  attention?: boolean;
  onClick: () => void;
}) {
  const hasCount = count !== undefined && count > 0;
  return (
    <button
      type="button"
      className={`ds-tile ${attention && hasCount ? 'ds-tile--attention' : ''}`}
      onClick={onClick}
      aria-label={hasCount ? `${title}: ${count}` : title}
    >
      <span className="ds-tile__icon">
        <Icon name={icon} size={28} />
      </span>
      <span className="ds-tile__title">{title}</span>
      <span className="ds-tile__hint">{hint}</span>
      {hasCount && (
        <span className="ds-tile__count">
          <Count value={count} accent={attention} />
        </span>
      )}
    </button>
  );
}

export function Count({ value, accent }: { value: number; accent?: boolean }) {
  return <span className={`ds-count ${accent ? 'ds-count--accent' : ''}`}>{value > 99 ? '99+' : value}</span>;
}

/** Некликабельный второстепенный текст (принцип 4: никогда не синий). */
export function Muted({ children }: { children: ReactNode }) {
  return <p className="ds-text-secondary">{children}</p>;
}
