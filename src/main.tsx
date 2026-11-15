// Политика Trusted Types должна появиться раньше любого кода, который работает с HTML.
import './lib/trusted';
import '@fontsource-variable/onest/index.css';
import '@fontsource-variable/literata/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/features.css';
import './styles/markdown.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { applyTheme } from './app/store';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service Worker кладёт приложение в кеш: после первого открытия оно работает без сети (F17).
if (import.meta.env.PROD) registerSW({ immediate: true });
