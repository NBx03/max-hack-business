// «Поделиться» и «Скопировать» — экран 3 (SCREENS.md): «Поделиться» (системный шаринг MAX),
// «Скопировать код». В window.WebApp (max/webApp.ts) нет проверенного метода шаринга — в
// проекте фиксируются только реально сверенные с dev.max.ru поля моста, а sharing там не
// подтверждён. Поэтому используем стандартный Web Share API браузера (его поддерживают
// современные мобильные WebView, в том числе внутри мессенджеров) с проверкой доступности
// и запасным вариантом — копированием в буфer обмена, если поделиться не получилось.

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Продолжаем к запасному варианту ниже - например, вкладка не в фокусе.
    }
  }
  // Запасной вариант для контекстов без Clipboard API (старые WebView, не https).
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return copied;
}

/**
 * @returns 'shared' - открылось системное меню «Поделиться»; 'copied' - меню недоступно,
 *   ссылка скопирована в буфер; 'failed' - не удалось ни то, ни другое (текст покажет вызывающий код).
 */
export async function shareOrCopy(url: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (error) {
      // Пользователь закрыл системное меню - это не ошибка, просто не показываем тост.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'failed';
      }
      // Другая причина (например, share недоступен для этого типа данных) - пробуем копию.
    }
  }
  return (await copyToClipboard(url)) ? 'copied' : 'failed';
}
