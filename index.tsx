import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './src/ui/ToastContext';

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

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);