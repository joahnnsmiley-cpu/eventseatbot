/**
 * PostgreSQL-backed DB adapter — same API as db.ts (async).
 * Uses Supabase client; maps events ↔ events + event_tables, bookings ↔ bookings, admins ↔ admins.
 * Same function names and return types; all functions return Promise<> (callers must await).
 * Not imported anywhere yet; switch when Supabase is the source of truth.
 */
import { supabase } from './supabaseClient';
import type { EventData, Booking, Admin, Table, BookingStatus } from './models';

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
  image_url: string | null;
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
  created_at?: string;
};

type BookingsRow = {
  id: string;
  event_id: string;
  table_id: string | null;
  user_telegram_id: number | null;
  user_phone: string | null;
  seat_indices: number[] | null;
  seats_booked: number | null;
  status: string;
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
    imageUrl: row.image_url ?? '',
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
  if (expiresAt !== undefined) booking.expiresAt = expiresAt;
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

  // Load all event_tables and group by event_id so each event gets its tables
  const { data: tablesRows, error: tablesErr } = await supabase.from('event_tables').select('*');
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

  // 2. Always rebuild tables from event_tables (no event.tables ?? [])
  const { data: tablesRows, error: tablesErr } = await supabase
    .from('event_tables')
    .select('*')
    .eq('event_id', event.id);
  if (tablesErr) return undefined;

  // 3. Map event_tables rows to Table[]
  const tablesFromEventTables = (tablesRows ?? []).map((r) => eventTablesRowToTable(r as EventTablesRow));

  // 4. Assign: always from event_tables
  event.tables = tablesFromEventTables;
  return event;
}

export async function saveEvents(events: EventData[]): Promise<void> {
  if (!supabase) return;
  const ids = new Set(events.map((e) => e.id));
  const { data: existing } = await supabase.from('events').select('id');
  const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));
  for (const eid of existingIds) {
    if (!ids.has(eid)) {
      const { error } = await supabase.from('events').delete().eq('id', eid);
      if (error) throw error;
    }
  }
  for (const event of events) {
    await upsertEvent(event);
  }
}

export async function upsertEvent(event: EventData): Promise<void> {
  if (!supabase) return;
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

  const { error: delTablesErr } = await supabase.from('event_tables').delete().eq('event_id', event.id);
  if (delTablesErr) throw delTablesErr;
  for (const t of event.tables ?? []) {
    const { error } = await supabase
      .from('event_tables')
      .insert({
        id: t.id,
        event_id: event.id,
        number: t.number ?? 1,
        seats_total: t.seatsTotal,
        seats_available: t.seatsAvailable ?? t.seatsTotal,
        x: t.x,
        y: t.y,
        center_x: t.centerX,
        center_y: t.centerY,
        size_percent: t.sizePercent ?? null,
        shape: t.shape ?? null,
        color: t.color ?? null,
        // requires column event_tables.is_available (see migration)
        is_available: t.isAvailable ?? false,
      });

    if (error) {
      console.error('[EVENT_TABLE INSERT FAILED]', {
        eventId: event.id,
        table: t,
        error,
      });
      throw error;
    }
  }

  const { data: checkRows } = await supabase
    .from('event_tables')
    .select('id')
    .eq('event_id', event.id);

  console.log(
    '[UPSERT EVENT]',
    'event_id:',
    event.id,
    'tables written:',
    checkRows?.length,
  );
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
  const expiresAt = booking.expiresAt != null
    ? (typeof booking.expiresAt === 'number' ? new Date(booking.expiresAt).toISOString() : booking.expiresAt)
    : null;
  const { error } = await supabase.from('bookings').insert({
    id: booking.id,
    event_id: booking.eventId,
    table_id: booking.tableId ?? null,
    user_telegram_id: booking.userTelegramId ?? null,
    user_phone: booking.userPhone ?? null,
    seat_indices: booking.seatIndices ?? null,
    seats_booked: booking.seatsBooked ?? null,
    status: booking.status,
    created_at: new Date(booking.createdAt).toISOString(),
    expires_at: expiresAt,
  });
  if (error) throw error;
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
