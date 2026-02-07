const normalizeBaseUrl = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';

const mode = import.meta.env.MODE;
const prodBase = import.meta.env.VITE_API_BASE_URL;
const previewBase = import.meta.env.VITE_API_PREVIEW_BASE_URL;

const rawBase = mode !== 'production' ? (previewBase || prodBase) : prodBase;

export const apiBaseUrl = normalizeBaseUrl(rawBase);

export const getApiBaseUrl = () => apiBaseUrl;
