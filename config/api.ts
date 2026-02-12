const normalizeBaseUrl = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';

const PRODUCTION_API_BASE_URL = 'https://eventseatbot.onrender.com';

const mode = import.meta.env.MODE;
const prodBase = import.meta.env.VITE_API_BASE_URL;
const previewBase = import.meta.env.VITE_API_PREVIEW_BASE_URL;

const rawBase = mode !== 'production' ? (previewBase || prodBase) : prodBase;
const normalized = normalizeBaseUrl(rawBase);

const isDevOrEmpty =
  !normalized ||
  normalized.startsWith('http://localhost') ||
  normalized.startsWith('http://127.0.0.1') ||
  normalized === '/api' ||
  normalized.startsWith('/api');

export const apiBaseUrl = isDevOrEmpty ? PRODUCTION_API_BASE_URL : normalized;

export const getApiBaseUrl = () => apiBaseUrl;
