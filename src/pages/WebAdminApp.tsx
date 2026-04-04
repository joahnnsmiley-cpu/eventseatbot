import React, { useState, useEffect } from 'react';
import AdminPanel from '../../components/AdminPanel';
import AuthService from '../../services/authService';
import WebAdminLoginPage from './WebAdminLoginPage';

const WEB_ADMIN_JWT_KEY = 'nnk_web_admin_jwt';

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
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Thin top bar with logout button */}
      <div className="sticky top-0 z-50 bg-[#0f0f0f] border-b border-white/10 flex items-center justify-between px-4 h-10">
        <span className="text-xs text-white/40 font-medium">#НиктоНеКруче — веб-панель</span>
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs text-white/40 hover:text-white/80 transition-colors"
        >
          Выйти
        </button>
      </div>

      {/* Admin panel runs in its own scroll context */}
      <AdminPanel
        isAdmin={true}
        organizerEventIds={[]}
        onBack={handleLogout}
        onViewAsUser={() => {
          // In web panel just open a new tab pointing to the main app
          window.open(window.location.origin + '/', '_blank');
        }}
      />
    </div>
  );
}
