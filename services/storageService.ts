import { EventData, Booking } from '../types';
import AuthService from './authService';
import { getApiBaseUrl } from '@/config/api';

export const getEvents = async (): Promise<EventData[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/public/events`);
  if (!res.ok) throw new Error('Failed to load events');
  if (res.status === 204) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export const getEvent = async (eventId: string): Promise<EventData> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/public/events/${eventId}`);
  if (!res.ok) throw new Error('Failed to load event');
  const data = await res.json();
  // Normalize so frontend always has tables array (API returns tables; ensure it's never missing)
  const tables = Array.isArray(data.tables) ? data.tables : [];
  return { ...data, tables } as EventData;
};

export const createBooking = async (
  eventId: string,
  seatFullIds: string[],
): Promise<any> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeader() },
    body: JSON.stringify({ eventId, seatIds: seatFullIds }),
  });
  if (!res.ok) {
    if (res.status === 403) {
      AuthService.logout();
      throw new Error('Forbidden');
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create booking');
  }
  // Server responds with { booking, paymentInstructions }
  const data = await res.json();
  return data.booking || data;
};

export const createTableBooking = async (payload: {
  eventId: string;
  tableId: string;
  seatsRequested: number;
  userPhone: string;
}): Promise<any> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/public/bookings/table`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error: Error & { status?: number } = new Error(err.error || 'Failed to create booking');
    error.status = res.status;
    throw error;
  }
  return res.json();
};

/** Create a pending booking (no payment, no seat blocking). Body: eventId, tableId, seats (number[]), phone. */
export const createPendingBooking = async (payload: {
  eventId: string;
  tableId: string;
  seats: number[];
  phone: string;
}): Promise<{ id: string }> => {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/public/bookings`;
  const body = JSON.stringify(payload);
  console.log('[createPendingBooking] request', { method: 'POST', url, payload });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await res.text();
  let data: { id?: string; ok?: boolean; error?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    console.warn('[createPendingBooking] response not JSON', { status: res.status, text: text.slice(0, 200) });
  }
  console.log('[createPendingBooking] response', { status: res.status, ok: res.ok, data });
  if (!res.ok) {
    const error: Error & { status?: number } = new Error(
      (data && typeof data.error === 'string' ? data.error : null) || res.statusText || 'Failed to create booking'
    );
    error.status = res.status;
    throw error;
  }
  return { id: data.id ?? 'temp', ...data } as { id: string };
};

export const getMyBookings = async (): Promise<Booking[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/me/bookings`, { headers: AuthService.getAuthHeader() });
  if (!res.ok) {
    if (res.status === 403) {
      AuthService.logout();
      throw new Error('Forbidden');
    }
    throw new Error('Failed to load bookings');
  }
  return res.json();
};

export const getMyTickets = async (): Promise<Booking[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/me/tickets`, { headers: AuthService.getAuthHeader() });
  if (!res.ok) {
    if (res.status === 403) {
      AuthService.logout();
      throw new Error('Forbidden');
    }
    throw new Error('Failed to load tickets');
  }
  return res.json();
};

// Admin-side helpers
export const getAdminBookings = async (status?: string): Promise<Booking[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const url = new URL(`${apiBaseUrl}/admin/bookings`);
  if (status) url.searchParams.set('status', status);
  const res = await fetch(url.toString(), { headers: AuthService.getAuthHeader() });
  if (!res.ok) {
    if (res.status === 403) {
      AuthService.logout();
      throw new Error('Forbidden');
    }
    throw new Error('Failed to load admin bookings');
  }
  return res.json();
};

export const confirmBooking = async (bookingId: string): Promise<void> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/bookings/${bookingId}/confirm`, {
    method: 'POST',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) {
    if (res.status === 403) {
      AuthService.logout();
      throw new Error('Forbidden');
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to confirm booking');
  }
};

// Admin events API
export const getAdminEvents = async (): Promise<EventData[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events`, { headers: AuthService.getAuthHeader() });
  if (!res.ok) {
    if (res.status === 403) {
      AuthService.logout();
      throw new Error('Forbidden');
    }
    throw new Error('Failed to load admin events');
  }
  return res.json();
};

export const getAdminEvent = async (id: string): Promise<EventData> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events/${encodeURIComponent(id)}`, { headers: AuthService.getAuthHeader() });
  if (!res.ok) {
    if (res.status === 403) {
      AuthService.logout();
      throw new Error('Forbidden');
    }
    throw new Error('Failed to load admin event');
  }
  return res.json();
};

export const createAdminEvent = async (payload: Partial<EventData>): Promise<EventData> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    if (res.status === 403) {
      AuthService.logout();
      throw new Error('Forbidden');
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create event');
  }
  return res.json();
};

export const updateAdminEvent = async (id: string, payload: Partial<EventData>): Promise<EventData> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    if (res.status === 403) {
      AuthService.logout();
      throw new Error('Forbidden');
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update event');
  }
  return res.json();
};

export const deleteAdminEvent = async (id: string): Promise<void> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) {
    if (res.status === 403) {
      AuthService.logout();
      throw new Error('Forbidden');
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete event');
  }
};

// Client больше не управляет lock-ами; это делает backend.
export const cleanupExpiredLocks = () => {
  // no-op: на бэкенде есть фоновой процесс очистки
};