import { EventData, Booking } from '../types';
import AuthService from './authService';
import { getApiBaseUrl } from '@/config/api';

type ErrorBody = { error?: string };

/**
 * Handle failed response for authenticated requests.
 * - 401: logout + throw (invalid/expired token).
 * - 403, 409, 422, etc.: throw with message from body, no logout.
 */
async function handleAuthError(res: Response, defaultMessage: string): Promise<never> {
  const err = (await res.json().catch(() => ({}))) as ErrorBody;
  const msg = err?.error;
  if (res.status === 401) {
    AuthService.logout();
    throw new Error(msg || 'Unauthorized');
  }
  if (res.status === 403) {
    throw new Error(msg || 'Forbidden');
  }
  throw new Error(msg || defaultMessage);
}

export type GetEventsResult = {
  featured: EventData | null;
  events: EventData[];
};

const normalizeEvent = (e: EventData & { coverImageUrl?: string | null }) => ({
  ...e,
  imageUrl: e.imageUrl ?? e.coverImageUrl ?? null,
  tables: Array.isArray(e.tables) ? e.tables : [],
});

export const getEvents = async (): Promise<GetEventsResult> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/public/events`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load events');
  if (res.status === 204) return { featured: null, events: [] };
  const data = await res.json();
  const featured = data.featured ? normalizeEvent(data.featured) : null;
  const events = Array.isArray(data.events) ? data.events.map(normalizeEvent) : [];
  return { featured, events };
};

export const getEvent = async (eventId: string): Promise<EventData> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/public/events/${eventId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load event');
  const data = await res.json();
  // Public API returns coverImageUrl; normalize to imageUrl (poster). Tables from event_tables.
  const tables = Array.isArray(data.tables) ? data.tables : [];
  const imageUrl = data.imageUrl ?? data.coverImageUrl ?? null;
  return { ...data, imageUrl, tables } as EventData;
};

/** GET /public/bookings/my?telegramId=... — returns user bookings (no auth). */
export const getMyBookingsPublic = async (telegramId: number): Promise<{
  id: string;
  event_id: string;
  table_id: string | null;
  seat_indices: number[];
  seats_booked: number;
  total_amount?: number;
  status: string;
  created_at: string;
  expires_at: string | null;
  ticket_file_url?: string | null;
}[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/public/bookings/my?telegramId=${encodeURIComponent(telegramId)}`);
  if (!res.ok) throw new Error('Failed to load bookings');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

/** GET /public/events/:eventId/occupied-seats — returns [{ table_id, seat_indices }] */
export const getOccupiedSeats = async (eventId: string): Promise<{ table_id: string; seat_indices: number[] }[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/public/events/${eventId}/occupied-seats`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load occupied seats');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export const createTableBooking = async (payload: {
  eventId: string;
  tableId: string;
  seatsRequested: number;
  userPhone: string;
  userComment?: string;
}): Promise<any> => {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/public/bookings/table`;
  const res = await fetch(url, {
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

/** POST /public/bookings/seats — seat-based booking with conflict check. */
export const createSeatsBooking = async (payload: {
  eventId: string;
  tableId: string;
  seatIndices: number[];
  userPhone: string;
  telegramId: number;
  totalAmount?: number;
  userComment?: string;
}): Promise<any> => {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/public/bookings/seats`;
  const res = await fetch(url, {
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

/** PATCH /public/bookings/:id/status — set booking status to awaiting_confirmation (e.g. after "Я оплатил"). */
export const updateBookingStatus = async (bookingId: string, status: 'awaiting_confirmation'): Promise<{ ok: boolean; booking: Booking }> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/public/bookings/${encodeURIComponent(bookingId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to update booking status');
  }
  return res.json();
};

/** POST /public/contact-organizer — send user message to admins (only admins see it). */
export const contactOrganizer = async (payload: {
  eventId: string;
  problemText: string;
  bookingId?: string;
  userTelegramId?: number;
  userFirstName?: string;
  userLastName?: string;
  userUsername?: string;
}): Promise<{ ok: boolean }> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/public/contact-organizer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to send message');
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
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('BOOKING ERROR', err);
    throw err;
  }
  console.log(res.status);
  console.log(res.headers.get('content-type'));
  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    /* response not JSON */
  }
  let data: { id?: string; ok?: boolean; error?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* response not JSON */
  }
  if (!res.ok) {
    const error: Error & { status?: number } = new Error(
      (data && typeof data.error === 'string' ? data.error : null) || res.statusText || 'Failed to create booking'
    );
    error.status = res.status;
    throw error;
  }
  return { id: data.id ?? 'temp', ...data } as { id: string };
};

export type UserInfo = {
  isPremium: boolean;
  premiumMessage?: string | null;
};

export const getUserInfo = async (): Promise<UserInfo> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/me/user`, { headers: AuthService.getAuthHeader() });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized');
    throw new Error('Failed to load user info');
  }
  return res.json();
};

export const getMyBookings = async (): Promise<Booking[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/me/bookings`, { headers: AuthService.getAuthHeader() });
  if (!res.ok) await handleAuthError(res, 'Failed to load bookings');
  return res.json();
};

/** Response from GET /me/profile-guest — data for ProfileGuestScreen. */
export type ProfileGuestData =
  | { hasBooking: false }
  | {
      hasBooking: true;
      guestName: string;
      avatarUrl: string;
      event: { name: string; title: string; start_at: string; date: string; venue: string };
      tableNumber: number;
      categoryName: string;
      categoryColorKey: string;
      seatNumbers: number[];
      seatsFree: number;
      neighbors: Array<{ name: string; avatar: string }>;
      privileges: string[];
      privateAccess: string;
    };

/** GET /me/profile-guest — data for ProfileGuestScreen. */
export const getProfileGuestData = async (): Promise<ProfileGuestData> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/me/profile-guest`, { headers: AuthService.getAuthHeader() });
  if (!res.ok) await handleAuthError(res, 'Failed to load profile');
  return res.json();
};

/** Response from GET /me/profile-organizer — data for ProfileOrganizerScreen. */
export type ProfileOrganizerData =
  | { hasData: false }
  | {
      hasData: true;
      eventDate: string;
      stats: { guestsTotal: number; fillPercent: number; ticketsSold: number; seatsFree: number };
      tables: { total: number; full: number; partial: number; empty: number };
      vipGuests: Array<{ name: string; category: string }>;
    };

/** GET /me/profile-organizer — data for ProfileOrganizerScreen. eventId optional. */
export const getProfileOrganizerData = async (eventId?: string | null): Promise<ProfileOrganizerData> => {
  const apiBaseUrl = getApiBaseUrl();
  const url = new URL(`${apiBaseUrl}/me/profile-organizer`);
  if (eventId) url.searchParams.set('eventId', eventId);
  const res = await fetch(url.toString(), { headers: AuthService.getAuthHeader() });
  if (!res.ok) await handleAuthError(res, 'Failed to load organizer profile');
  return res.json();
};

export const getMyTickets = async (): Promise<Booking[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/me/tickets`, { headers: AuthService.getAuthHeader() });
  if (!res.ok) await handleAuthError(res, 'Failed to load tickets');
  return res.json();
};

// Admin-side helpers
export const getAdminBookings = async (status?: string): Promise<Booking[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const url = new URL(`${apiBaseUrl}/admin/bookings`);
  if (status) url.searchParams.set('status', status);
  const res = await fetch(url.toString(), { headers: AuthService.getAuthHeader() });
  if (!res.ok) await handleAuthError(res, 'Failed to load admin bookings');
  return res.json();
};

export const confirmBooking = async (bookingId: string): Promise<void> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/bookings/${bookingId}/confirm`, {
    method: 'POST',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) await handleAuthError(res, 'Failed to confirm booking');
};

/** PATCH /admin/bookings/:id/confirm — set status to paid. */
export const confirmBookingPayment = async (bookingId: string): Promise<any> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/bookings/${encodeURIComponent(bookingId)}/confirm`, {
    method: 'PATCH',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) await handleAuthError(res, 'Failed to confirm payment');
  return res.json();
};

/** PATCH /admin/bookings/:id/cancel — cancel booking, restore seats. */
export const cancelBooking = async (bookingId: string): Promise<any> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/bookings/${encodeURIComponent(bookingId)}/cancel`, {
    method: 'PATCH',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) await handleAuthError(res, 'Failed to cancel booking');
  return res.json();
};

/** POST /admin/resync-seats — recalculate seatsAvailable from bookings */
export const resyncSeats = async (): Promise<{ ok: boolean; eventsProcessed: number; tablesUpdated: number }> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/resync-seats`, {
    method: 'POST',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) await handleAuthError(res, 'Failed to resync seats');
  return res.json();
};

// Admin events API — tables are always from backend (event_tables join), never from events.tables jsonb.
export const getAdminEvents = async (): Promise<EventData[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events`, { headers: AuthService.getAuthHeader() });
  if (!res.ok) await handleAuthError(res, 'Failed to load admin events');
  const data = await res.json();
  const list = Array.isArray(data) ? data : [];
  return list.map((e: EventData) => ({ ...e, tables: Array.isArray(e.tables) ? e.tables : [] }));
};

/** GET /admin/server-time — current UTC for timezone offset calculation */
export const getAdminServerTime = async (): Promise<{ utc: string }> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/server-time`, {
    method: 'GET',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) await handleAuthError(res, 'Failed to get server time');
  return res.json();
};

/** GET /admin/events/:id — full EventData with tables (from backend event_tables join). Never use PUT response or list as source of tables. */
export const getAdminEvent = async (id: string): Promise<EventData> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) await handleAuthError(res, 'Failed to load admin event');
  const data = await res.json();
  const tables = Array.isArray(data.tables) ? data.tables : [];
  return { ...data, tables } as EventData;
};

export const createAdminEvent = async (payload: Partial<EventData>): Promise<EventData> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleAuthError(res, 'Failed to create event');
  return res.json();
};

/** POST /admin/events/:id/upload-poster — upload poster (cover) image to Supabase, returns { url, version } */
export const uploadPosterImage = async (eventId: string, file: File): Promise<{ url: string; version?: number }> => {
  const apiBaseUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${apiBaseUrl}/admin/events/${encodeURIComponent(eventId)}/upload-poster`, {
    method: 'POST',
    headers: AuthService.getAuthHeader(),
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Upload failed');
  }
  return res.json();
};

/** POST /admin/events/:id/upload-ticket-template — upload ticket template PNG to Supabase */
export const uploadTicketTemplateImage = async (eventId: string, file: File): Promise<{ url: string }> => {
  const apiBaseUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${apiBaseUrl}/admin/events/${encodeURIComponent(eventId)}/upload-ticket-template`, {
    method: 'POST',
    headers: AuthService.getAuthHeader(),
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Upload failed');
  }
  return res.json();
};

/** POST /admin/upload-layout — upload layout image to Supabase, returns { url, version } */
export const uploadLayoutImage = async (eventId: string, file: File): Promise<{ url: string; version?: number }> => {
  const apiBaseUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('eventId', eventId);

  const res = await fetch(`${apiBaseUrl}/admin/upload-layout`, {
    method: 'POST',
    headers: AuthService.getAuthHeader(),
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Upload failed');
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
  if (!res.ok) await handleAuthError(res, 'Failed to update event');
  return res.json();
};

export const publishAdminEvent = async (id: string): Promise<EventData> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) await handleAuthError(res, 'Failed to publish event');
  return res.json();
};

export const archiveAdminEvent = async (id: string): Promise<EventData> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) await handleAuthError(res, 'Failed to archive event');
  return res.json();
};

export const deleteAdminEvent = async (id: string): Promise<void> => {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/admin/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: AuthService.getAuthHeader(),
  });
  if (!res.ok) await handleAuthError(res, 'Failed to delete event');
};

// Client больше не управляет lock-ами; это делает backend.
export const cleanupExpiredLocks = () => {
  // no-op: на бэкенде есть фоновой процесс очистки
};