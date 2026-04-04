import React, { useState, useEffect } from 'react';
import AdminPanel from '../../components/AdminPanel';
import AuthService from '../../services/authService';
import WebAdminLoginPage from './WebAdminLoginPage';

const WEB_ADMIN_JWT_KEY = 'nnk_web_admin_jwt';

/** Inject desktop-specific CSS overrides once */
const DESKTOP_STYLE = `
  body.web-admin-mode {
    background: #0a0a0a;
    overflow-x: hidden;
  }

  /* Wider content area with desktop padding */
  body.web-admin-mode .admin-root {
    max-width: 1600px !important;
    margin: 0 auto !important;
    padding: 28px 40px 120px !important;
  }

  /* Save/action bar — full width on desktop, not mobile-centered */
  body.web-admin-mode .fixed.bottom-0.left-0.right-0 {
    max-width: 100% !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    padding-left: 40px !important;
    padding-right: 40px !important;
  }

  /* TableEditPanel — wider sidebar for desktop readability */
  body.web-admin-mode .fixed.right-0.top-0.h-full {
    width: 380px !important;
  }

  /* Add table "+" button — reposition away from wider right panel */
  body.web-admin-mode .fixed.bottom-28.right-4 {
    right: 400px !important;
  }

  /* Venue map container — let it breathe on wide screens */
  body.web-admin-mode .relative.border.border-white\\/10.rounded-2xl {
    min-height: 520px;
  }

  /* Dialogs and modals stay centered */
  body.web-admin-mode .fixed.inset-0 {
    max-width: 100% !important;
    margin: 0 !important;
  }

  /* Remove mobile safe-area padding influence on desktop */
  body.web-admin-mode * {
    --safe-area: 0px;
  }
`;

function injectStyle() {
  if (document.getElementById('web-admin-style')) return;
  const el = document.createElement('style');
  el.id = 'web-admin-style';
  el.textContent = DESKTOP_STYLE;
  document.head.appendChild(el);
}

function removeStyle() {
  document.getElementById('web-admin-style')?.remove();
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Date.now() / 1000 > (payload.exp ?? 0);
  } catch {
    return true;
  }
}

export default function WebAdminApp() {
  const [token, setToken] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(WEB_ADMIN_JWT_KEY);
      if (stored && !isTokenExpired(stored)) return stored;
      if (stored) localStorage.removeItem(WEB_ADMIN_JWT_KEY);
    } catch { /* ignore */ }
    return null;
  });

  useEffect(() => {
    document.body.classList.add('web-admin-mode');
    injectStyle();
    return () => {
      document.body.classList.remove('web-admin-mode');
      removeStyle();
    };
  }, []);

  // Sync token into AuthService so all StorageService API calls work
  useEffect(() => {
    if (token) AuthService.setToken(token);
  }, [token]);

  const handleLogin = (jwt: string) => {
    try { localStorage.setItem(WEB_ADMIN_JWT_KEY, jwt); } catch { /* ignore */ }
    AuthService.setToken(jwt);
    setToken(jwt);
  };

  const handleLogout = () => {
    try { localStorage.removeItem(WEB_ADMIN_JWT_KEY); } catch { /* ignore */ }
    AuthService.logout();
    setToken(null);
  };

  if (!token) {
    return <WebAdminLoginPage onLogin={handleLogin} />;
  }

  return (
    <AdminPanel
      isAdmin={true}
      organizerEventIds={[]}
      onBack={handleLogout}
      onViewAsUser={() => {
        window.open(window.location.origin + '/', '_blank');
      }}
    />
  );
}
