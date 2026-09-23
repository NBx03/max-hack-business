import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MaxUI } from '@maxhub/max-ui';
import '@maxhub/max-ui/styles.css';
import './theme/tokens.css';

import { App } from './App';
import { SessionProvider } from './app/SessionContext';
import { watchRelaunch } from './app/launch';

// Повторное открытие из бота при уже открытом мини-приложении (app/launch.ts).
watchRelaunch();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Не найден корневой элемент #root');
}

createRoot(container).render(
  <StrictMode>
    <MaxUI resetBody className="app-root">
      <SessionProvider>
        <App />
      </SessionProvider>
    </MaxUI>
  </StrictMode>,
);
