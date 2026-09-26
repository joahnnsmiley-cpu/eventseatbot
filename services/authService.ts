import { getApiBaseUrl } from '@/config/api';

const API_BASE = getApiBaseUrl();

const STORAGE_KEY = 'eventseatbot_jwt';

let token: string | null = null;

const emitAuthChange = (t: string | null) => {
  try {
    window.dispatchEvent(new CustomEvent('auth:changed', { detail: { token: t } }));
  } catch { }
};

export const setToken = (t: string | null) => {
  token = t;
  try {
    if (t) sessionStorage.setItem(STORAGE_KEY, t);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { }
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

/** Claims this app puts into the JWT. Unknown extras stay allowed via the index signature. */
export type TokenPayload = {
  id?: string | number;
  role?: string;
  isController?: boolean;
  organizerEventIds?: string[];
  [key: string]: unknown;
};

export const decodeToken = (t: string | null): TokenPayload | null => {
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
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
};

export const loginWithTelegram = async (telegramId: number, initData: string) => {
  const res = await fetch(`${API_BASE}/auth/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId, initData }),
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

/**
 * Перевыпустить токен тем же способом, которым он был получен.
 *
 * Нужна там, где запрос уже упёрся в 401: токена нет, он протух или его
 * отклонили. Молча получить новый и повторить запрос честнее, чем просить
 * человека закрыть и открыть приложение.
 *
 * Возвращает true, если токен получен.
 */
export const reauthenticate = async (): Promise<boolean> => {
  try {
    const url = window.location.href;
    const isVk = /[?&#](vk_user_id|vk_app_id)=/.test(url);
    if (isVk) {
      const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, ''));
      const vkUserId = params.get('vk_user_id');
      if (!vkUserId) return false;
      await loginWithVk(vkUserId, params.toString());
      return Boolean(getToken());
    }
    const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; initDataUnsafe?: { user?: { id?: number } } } } }).Telegram?.WebApp;
    const initData = tg?.initData || '';
    const id = tg?.initDataUnsafe?.user?.id;
    if (!initData || !id) return false;
    await loginWithTelegram(id, initData);
    return Boolean(getToken());
  } catch {
    return false;
  }
};

export const logout = () => setToken(null);

// initialize token from storage on module load
loadToken();

export const loginWithVk = async (vkUserId: number | string, allParams: string) => {
  console.log(`[AuthService] loginWithVk: userId=${vkUserId}, allParamsLen=${allParams?.length}`);
  const params = new URLSearchParams(allParams);
  const vkSign = params.get('vk_sign') || params.get('sign');

  if (!vkSign) {
    console.warn('[AuthService] No vk_sign found in allParams string!');
    console.log('[AuthService] raw allParams:', allParams);
  }

  const res = await fetch(`${API_BASE}/auth/vk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vkUserId, vkSign, allParams }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err && (err as any).error) || 'VK Login failed');
  }
  const data = await res.json();
  const t = data.token as string | undefined;
  if (!t) throw new Error('No token returned');
  setToken(t);
  return data;
};

export default {
  loginWithTelegram,
  loginWithVk,
  reauthenticate,
  getToken,
  getAuthHeader,
  decodeToken,
  logout,
  setToken,
};
