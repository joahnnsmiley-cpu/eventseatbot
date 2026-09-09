import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './src/ui/ToastContext';
import WebAdminApp from './src/pages/WebAdminApp';

// Call VKWebAppInit as early as possible so VK removes its loading overlay
// This must happen before React renders, not inside a useEffect
if ((import.meta as any).env.VITE_PLATFORM === 'vk') {
  import('@vkontakte/vk-bridge').then((m) => {
    const bridge = m.default;

    // Subscribe to safe area insets to push content below the native VK header on iOS
    bridge.subscribe((e) => {
      if (e.detail.type === 'VKWebAppUpdateConfig') {
        const data = (e.detail.data as any) || {};
        if (data.insets) {
          document.body.style.paddingTop = `${data.insets.top}px`;
          document.body.style.paddingBottom = `${data.insets.bottom}px`;
          // Also expose as CSS variables just in case
          document.documentElement.style.setProperty('--vk-safe-top', `${data.insets.top}px`);
          document.documentElement.style.setProperty('--vk-safe-bottom', `${data.insets.bottom}px`);
        }
      }
    });

    bridge.send('VKWebAppInit').catch(() => { });
  }).catch(() => { });
}


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const isWebAdmin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

/**
 * The Telegram SDK is injected asynchronously by index.html, but the app reads
 * window.Telegram.WebApp once, without retrying: if it renders first, the platform
 * gate flashes "only inside Telegram" and auth never starts. Wait for the SDK before
 * the first render, with a timeout so a blocked telegram.org cannot hang the app.
 */
const isVkLaunch = /[?&#](vk_user_id|vk_app_id)=/.test(window.location.href);

function waitForTelegramSdk(timeoutMs = 3000): Promise<void> {
  if (isVkLaunch || (window as any).Telegram?.WebApp) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if ((window as any).Telegram?.WebApp || Date.now() - startedAt > timeoutMs) resolve();
      else setTimeout(tick, 50);
    };
    tick();
  });
}

const root = ReactDOM.createRoot(rootElement);

void waitForTelegramSdk().then(() => {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          {isWebAdmin ? <WebAdminApp /> : <App />}
        </ToastProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
});