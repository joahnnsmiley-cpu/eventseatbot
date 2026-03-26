import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './src/ui/ToastContext';

// Call VKWebAppInit as early as possible so VK removes its loading overlay
// This must happen before React renders, not inside a useEffect
if (import.meta.env.VITE_PLATFORM === 'vk') {
  import('@vkontakte/vk-bridge').then((m) => {
    m.default.send('VKWebAppInit').catch(() => { });
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