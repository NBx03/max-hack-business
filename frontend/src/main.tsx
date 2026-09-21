import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MaxUI } from '@maxhub/max-ui';
import '@maxhub/max-ui/styles.css';

import { App } from './App';
import { SessionProvider } from './app/SessionContext';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Не найден корневой элемент #root');
}

createRoot(container).render(
  <StrictMode>
    <MaxUI resetBody>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MaxUI>
  </StrictMode>,
);
