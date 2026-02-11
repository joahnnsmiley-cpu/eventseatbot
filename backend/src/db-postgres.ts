/**
 * PostgreSQL-backed DB adapter — same API as db.ts (async).
 * Uses Supabase client; maps events ↔ events + event_tables, bookings ↔ bookings, admins ↔ admins.
 * Same function names and return types; all functions return Promise<> (callers must await).
 * Not imported anywhere yet; switch when Supabase is the source of truth.
 */
import { supabase } from './supabaseClient';
import type { EventData, Booking, Admin, Table, BookingStatus, Ticket } from './models';

// NOTE:
// Event tables are stored in a separate table (event_tables).
// events.tables (jsonb) is NOT used and must remain NULL.
// All reads must join event_tables via findEventById / getEvents.

// ---- Row types (snake_case from DB) ----
type EventsRow = {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  /** image_url — poster (event banner / cover image); not used as layout. */
  image_url: string | null;
  /** layout_image_url — seating map only (рассадка); not for poster/cover. */
  layout_image_url: string | null;
  organizer_phone: string | null;
  published: boolean | null;
  created_at?: string;
  updated_at?: string;
};

type EventTablesRow = {
  id: string;
  event_id: string;
  number: number;
  seats_total: number;
  seats_available: number;
  x: number | null;
  y: number | null;
  center_x: number | null;
  center_y: number | null;
  size_percent: number | null;
  shape: string | null;
  color: string | null;
  is_available: boolean | null;
  is_active?: boolean | null;
  created_at?: string;
};

type BookingsRow = {
  id: string;
  event_id: string;
  table_id: string | null;
  user_telegram_id: number | null;
  user_phone: string | null;
  user_comment: string | null;
  seat_indices: number[] | null;
  seats_booked: number | null;
  status: string;
  tickets?: unknown;
  created_at?: string;
  expires_at: string | null;
};

type AdminsRow = {
  id: number;
  created_at?: string;
};

// ---- Helpers: row → app type ----
function eventsRowToEvent(row: EventsRow, tables: Table[]): EventData {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    date: row.date ?? new Date().toISOString(),
    // image_url → imageUrl: poster (banner/cover); not layout
    imageUrl: row.image_url ?? '',
    // layout_image_url → layoutImageUrl: seating only (рассадка)
    layoutImageUrl: row.layout_image_url ?? null,
    schemaImageUrl: null,
    paymentPhone: row.organizer_phone ?? '',
    maxSeatsPerBooking: 4,
    tables,
    status: row.published ? 'published' : 'draft',
    published: row.published ?? false,
  };
}

function eventTablesRowToTable(row: EventTablesRow): Table {
  const t: Table = {
    id: row.id,
    number: row.number,
    seatsTotal: row.seats_total,
    seatsAvailable: row.seats_available,
    isAvailable: row.is_available ?? false,
    is_active: row.is_active !== false,
    x: row.x ?? 0,
    y: row.y ?? 0,
    centerX: row.center_x ?? row.x ?? 0,
    centerY: row.center_y ?? row.y ?? 0,
  };
  if (row.size_percent != null) t.sizePercent = row.size_percent;
  if (row.shape != null) t.shape = row.shape;
  if (row.color != null) t.color = row.color;
  return t;
}

function bookingsRowToBooking(row: BookingsRow): Booking {
  const createdAt = row.created_at
    ? (typeof row.created_at === 'string' ? new Date(row.created_at).getTime() : row.created_at)
    : Date.now();
  const expiresAt: string | number | undefined = row.expires_at
    ? (typeof row.expires_at === 'string' ? row.expires_at : new Date(row.expires_at).toISOString())
    : undefined;
  const booking: Booking = {
    id: row.id,
    eventId: row.event_id,
    userTelegramId: row.user_telegram_id ?? 0,
    username: '',
    userPhone: row.user_phone ?? '',
    seatIds: [],
    totalAmount: 0,
    status: row.status as BookingStatus,
    createdAt,
  };
  if (row.table_id != null) booking.tableId = row.table_id;
  if (row.seats_booked != null) booking.seatsBooked = row.seats_booked;
  if (row.seat_indices != null) booking.seatIndices = row.seat_indices;
  if (row.user_comment != null) booking.userComment = row.user_comment;
  if (expiresAt !== undefined) booking.expiresAt = expiresAt;
  if (Array.isArray(row.tickets)) booking.tickets = row.tickets as Ticket[];
  return booking;
}

function adminRowToAdmin(row: AdminsRow): Admin {
  return { id: row.id };
}

// ---- Events ----
export async function getEvents(): Promise<EventData[]> {
  if (!supabase) return [];
  const { data: eventsRows, error: eventsErr } = await supabase.from('events').select('*').order('created_at', { ascending: false });
  if (eventsErr) throw eventsErr;
  if (!eventsRows?.length) return [];

  // Load all event_tables (active only) and group by event_id
  const { data: tablesRows, error: tablesErr } = await supabase
    .from('event_tables')
    .select('*')
    .or('is_active.eq.true,is_active.is.null');
  if (tablesErr) throw tablesErr;
  const tablesByEventId = (tablesRows ?? []).reduce<Record<string, EventTablesRow[]>>((acc, r) => {
    const row = r as EventTablesRow;
    const arr = acc[row.event_id] ?? [];
    arr.push(row);
    acc[row.event_id] = arr;
    return acc;
  }, {});

  return (eventsRows as EventsRow[]).map((row) => {
    const event = eventsRowToEvent(row, []);
    // For each event: always set event.tables from event_tables (no fallback)
    const tablesFromEventTables = (tablesByEventId[event.id] ?? []).map((r) => eventTablesRowToTable(r as EventTablesRow));
    event.tables = tablesFromEventTables;
    return event;
  });
}

export async function findEventById(id: string): Promise<EventData | undefined> {
  if (!supabase) return undefined;
  // 1. Read event from events
  const { data: eventRow, error: eventErr } = await supabase.from('events').select('*').eq('id', id).single();
  if (eventErr || !eventRow) return undefined;

  const event = eventsRowToEvent(eventRow as EventsRow, []);

  // 2. Always rebuild tables from event_tables (active only)
  const { data: tablesRows, error: tablesErr } = await supabase
    .from('event_tables')
    .select('*')
    .eq('event_id', event.id)
    .or('is_active.eq.true,is_active.is.null');
  if (tablesErr) return undefined;

  // 3. Map event_tables rows to Table[]
  const tablesFromEventTables = (tablesRows ?? []).map((r) => eventTablesRowToTable(r as EventTablesRow));

  // 4. Assign: always from event_tables
  event.tables = tablesFromEventTables;
  return event;
}

export async function saveEvents(events: EventData[]): Promise<void> {
  if (!supabase) return;
  for (const event of events) {
    await upsertEvent(event);
  }
}

/** Get booked seats per table_id for an event (reserved/awaiting_confirmation/paid only) */
async function getBookedSeatsByTable(eventId: string): Promise<Record<string, number>> {
  if (!supabase) return {};
  const { data } = await supabase
    .from('bookings')
    .select('table_id, seat_indices, seats_booked')
    .eq('event_id', eventId)
    .in('status', ['reserved', 'awaiting_confirmation', 'paid']);
  const out: Record<string, number> = {};
  for (const b of data ?? []) {
    const tableId = b.table_id;
    if (!tableId) continue;
    const seats =
      b.seats_booked ??
      (Array.isArray(b.seat_indices) ? b.seat_indices.length : 0) ??
      0;
    out[tableId] = (out[tableId] ?? 0) + Number(seats);
  }
  return out;
}

export async function upsertEvent(event: EventData): Promise<void> {
  if (!supabase) return;
  // image_url — poster (event banner / cover image); layout_image_url — seating only (рассадка)
  const row: Omit<EventsRow, 'created_at' | 'updated_at'> = {
    id: event.id,
    title: event.title,
    description: event.description || null,
    date: event.date || null,
    image_url: event.imageUrl || null,
    layout_image_url: event.layoutImageUrl ?? null,
    organizer_phone: event.paymentPhone || null,
    published: event.published ?? false,
  };
  const { error: upsertErr } = await supabase.from('events').upsert(row, { onConflict: 'id' });
  if (upsertErr) throw upsertErr;

  const incomingTables = event.tables ?? [];
  const incomingIds = new Set(incomingTables.map((t) => t.id).filter(Boolean));
  const bookedByTable = await getBookedSeatsByTable(event.id);

  // 1. Process each incoming table
  for (const t of incomingTables) {
    const tableId = t.id;
    if (!tableId) continue;

    const seatsTotal = Math.max(0, Number(t.seatsTotal) || 0);
    const booked = bookedByTable[tableId] ?? 0;

    const { data: existing } = await supabase
      .from('event_tables')
      .select('id')
      .eq('id', tableId)
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing) {
      // UPDATE: seats_total (never below booked), seats_available = seats_total - booked, is_active = true
      const seatsTotalClamped = Math.max(booked, seatsTotal);
      const seatsAvailable = Math.max(0, seatsTotalClamped - booked);

      const { error: updErr } = await supabase
        .from('event_tables')
        .update({
          number: t.number ?? 1,
          seats_total: seatsTotalClamped,
          seats_available: seatsAvailable,
          x: t.x ?? null,
          y: t.y ?? null,
          center_x: t.centerX ?? t.x ?? null,
          center_y: t.centerY ?? t.y ?? null,
          size_percent: t.sizePercent ?? null,
          shape: t.shape ?? null,
          color: t.color ?? null,
          is_available: t.isAvailable ?? false,
          is_active: true,
        })
        .eq('id', tableId)
        .eq('event_id', event.id);

      if (updErr) {
        console.error('[EVENT_TABLE UPDATE FAILED]', { eventId: event.id, tableId, error: updErr });
        throw updErr;
      }
    } else {
      // INSERT new row: seats_available = seats_total - bookedSeats
      const seatsTotalClamped = Math.max(booked, seatsTotal);
      const seatsAvailable = Math.max(0, seatsTotalClamped - booked);
      const { error: insErr } = await supabase.from('event_tables').insert({
        id: tableId,
        event_id: event.id,
        number: t.number ?? 1,
        seats_total: seatsTotalClamped,
        seats_available: seatsAvailable,
        x: t.x ?? null,
        y: t.y ?? null,
        center_x: t.centerX ?? t.x ?? null,
        center_y: t.centerY ?? t.y ?? null,
        size_percent: t.sizePercent ?? null,
        shape: t.shape ?? null,
        color: t.color ?? null,
        is_available: t.isAvailable ?? false,
        is_active: true,
      });

      if (insErr) {
        console.error('[EVENT_TABLE INSERT FAILED]', { eventId: event.id, table: t, error: insErr });
        throw insErr;
      }
    }
  }

  // 2. Mark tables not in incoming list as is_active = false (never delete)
  const { data: allTables } = await supabase
    .from('event_tables')
    .select('id')
    .eq('event_id', event.id);

  for (const row of allTables ?? []) {
    if (!incomingIds.has(row.id)) {
      await supabase
        .from('event_tables')
        .update({ is_active: false })
        .eq('id', row.id)
        .eq('event_id', event.id);
    }
  }

  console.log('[UPSERT EVENT]', 'event_id:', event.id, 'tables:', incomingTables.length);
}

// ---- Bookings ----
export async function getBookings(): Promise<Booking[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => bookingsRowToBooking(r as BookingsRow));
}

export async function addBooking(booking: Booking): Promise<void> {
  if (!supabase) return;
  console.log('[DEBUG addBooking] supabase exists?', !!supabase);
  console.log('[DEBUG addBooking] URL:', process.env.SUPABASE_URL);
  console.log('[DEBUG addBooking] SERVICE KEY exists?', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  const expiresAt = booking.expiresAt != null
    ? (typeof booking.expiresAt === 'number' ? new Date(booking.expiresAt).toISOString() : booking.expiresAt)
    : null;
  const { error } = await supabase.from('bookings').insert({
    id: booking.id,
    event_id: booking.eventId,
    table_id: booking.tableId ?? null,
    user_telegram_id: booking.userTelegramId ?? null,
    user_phone: booking.userPhone ?? null,
    user_comment: booking.userComment ?? null,
    seat_indices: booking.seatIndices ?? null,
    seats_booked: booking.seatsBooked ?? null,
    status: booking.status,
    created_at: new Date(booking.createdAt).toISOString(),
    expires_at: expiresAt,
  });
  if (error) {
    console.error('[addBooking] Supabase insert error:', error);
    throw error;
  }
}

export async function saveBookings(bookings: Booking[]): Promise<void> {
  if (!supabase) return;
  await setBookings(bookings);
}

export async function setBookings(bookings: Booking[]): Promise<void> {
  if (!supabase) return;
  const { error: delErr } = await supabase.from('bookings').delete().neq('id', '');
  if (delErr) throw delErr;
  for (const b of bookings) {
    await addBooking(b);
  }
}

export async function updateBookingStatus(bookingId: string, status: BookingStatus): Promise<Booking | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.from('bookings').update({ status }).eq('id', bookingId).select().single();
  if (error) throw error;
  if (!data) return undefined;
  return bookingsRowToBooking(data as BookingsRow);
}

export async function updateBookingTickets(bookingId: string, tickets: Ticket[]): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('bookings').update({ tickets }).eq('id', bookingId);
  if (error) throw error;
}

// ---- Admins ----
export async function getAdmins(): Promise<Admin[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('admins').select('*');
  if (error) throw error;
  return (data ?? []).map((r) => adminRowToAdmin(r as AdminsRow));
}

export async function setAdmins(ids: number[]): Promise<void> {
  if (!supabase) return;
  const { error: delErr } = await supabase.from('admins').delete().neq('id', 0);
  if (delErr) throw delErr;
  for (const id of ids) {
    const { error } = await supabase.from('admins').insert({ id });
    if (error) throw error;
  }
}
