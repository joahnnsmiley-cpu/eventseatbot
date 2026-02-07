const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_BASE_URL) || 'http://localhost:4000';

const STORAGE_KEY = 'eventseatbot_jwt';

let token: string | null = null;

const emitAuthChange = (t: string | null) => {
  try {
    window.dispatchEvent(new CustomEvent('auth:changed', { detail: { token: t } }));
  } catch {}
};

export const setToken = (t: string | null) => {
  token = t;
  try {
    if (t) sessionStorage.setItem(STORAGE_KEY, t);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  emitAuthChange(t);
};

export const loadToken = () => {
  if (token) return token;
  try {
    const t = sessionStorage.getItem(STORAGE_KEY);
    token = t;
    return t;
  } catch {
    return null;
  }
};

export const getToken = () => token || loadToken();

export const getAuthHeader = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const decodeToken = (t: string | null) => {
  if (!t) return null;
  try {
    const parts = t.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const loginWithTelegram = async (telegramId: number) => {
  const res = await fetch(`${API_BASE}/auth/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err && (err as any).error) || 'Login failed');
  }
  const data = await res.json();
  const t = data.token as string | undefined;
  if (!t) throw new Error('No token returned');
  setToken(t);
  return data;
};

export const logout = () => setToken(null);

// initialize token from storage on module load
loadToken();

export default {
  loginWithTelegram,
  getToken,
  getAuthHeader,
  decodeToken,
  logout,
  setToken,
};
