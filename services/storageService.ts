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
  return res.json();
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