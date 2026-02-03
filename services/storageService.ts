import { EventData, Booking } from '../types';

const API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as any).env &&
    (import.meta as any).env.VITE_API_BASE) ||
  'http://localhost:4000';

export const getEvents = async (): Promise<EventData[]> => {
  const res = await fetch(`${API_BASE}/events`);
  if (!res.ok) throw new Error('Failed to load events');
  return res.json();
};

export const getEvent = async (eventId: string): Promise<EventData> => {
  const res = await fetch(`${API_BASE}/events/${eventId}`);
  if (!res.ok) throw new Error('Failed to load event');
  return res.json();
};

export const createBooking = async (
  eventId: string,
  telegramUserId: number,
  username: string,
  seatFullIds: string[],
): Promise<Booking> => {
  const res = await fetch(`${API_BASE}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, telegramUserId, username, seatIds: seatFullIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create booking');
  }
  return res.json();
};

export const getMyBookings = async (telegramUserId: number): Promise<Booking[]> => {
  const res = await fetch(
    `${API_BASE}/bookings/my?telegramUserId=${encodeURIComponent(String(telegramUserId))}`,
  );
  if (!res.ok) throw new Error('Failed to load bookings');
  return res.json();
};

// Admin-side helpers
export const getAdminBookings = async (status?: string): Promise<Booking[]> => {
  const url = new URL(`${API_BASE}/admin/bookings`);
  if (status) url.searchParams.set('status', status);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to load admin bookings');
  return res.json();
};

export const confirmBooking = async (bookingId: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/admin/bookings/${bookingId}/confirm`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to confirm booking');
  }
};

// Client больше не управляет lock-ами; это делает backend.
export const cleanupExpiredLocks = () => {
  // no-op: на бэкенде есть фоновой процесс очистки
};