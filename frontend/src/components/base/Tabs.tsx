// Вкладки списка документов (docs/SCREENS.md, экран 8) - вид по макету documents-list-screen:
// активная вкладка выделена заливкой и жирным текстом, у неё может быть счётчик.

/** Тот же бейдж-счётчик, что на вкладке "Ждут меня" - переиспользуется везде,
 *  где нужен числовой счётчик (например, "Заявки" в админ-меню). */
export function CountBadge({ count }: { count: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 6px',
        borderRadius: 10,
        background: 'var(--icon-primary)',
        color: 'var(--text-primary-inverse)',
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      {count}
    </span>
  );
}

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Счётчик рядом с текстом - у вкладки «Ждут меня». Не показываем, если 0 или не задан. */
  count?: number;
}

export function Tabs<K extends string>({
  tabs,
  activeKey,
  onChange,
}: {
  tabs: TabItem<K>[];
  activeKey: K;
  onChange: (key: K) => void;
}) {
  return (
    // Макет (documents-list-screen, admin-management-screen): tabs-row с justify-content: center.
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }} role="tablist">
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 10px',
              borderRadius: 6,
              border: 'none',
              background: active ? 'var(--background-secondary)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            {tab.label}
            {!!tab.count && <CountBadge count={tab.count} />}
          </button>
        );
      })}
    </div>
  );
}
