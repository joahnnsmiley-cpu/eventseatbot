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
  event_date?: string | null;
  event_time?: string | null;
  venue?: string | null;
  /** image_url — poster (event banner / cover image); fallback when poster_image_path is null. */
  image_url: string | null;
  /** poster_image_path — storage path in posters bucket; preferred over image_url when set. */
  poster_image_path?: string | null;
  poster_image_version?: number | null;
  /** layout_image_url — seating map only (рассадка); not for poster/cover. */
  layout_image_url: string | null;
  /** ticket_template_url — public URL of ticket template image in storage. */
  ticket_template_url?: string | null;
  organizer_phone: string | null;
  organizer_id?: number | null;
  published: boolean | null;
  is_featured?: boolean | null;
  ticket_categories?: any | null;
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
  width_percent?: number | null;
  height_percent?: number | null;
  rotation_deg?: number | null;
  shape: string | null;
  color: string | null;
  is_available: boolean | null;
  is_active?: boolean | null;
  visible_from?: string | null;
  visible_until?: string | null;
  ticket_category_id?: string | null;
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
  total_amount: number;
  status: string;
  tickets?: unknown;
  ticket_file_url?: string | null;
  is_used?: boolean | null;
  created_at?: string;
  expires_at: string | null;
};

type AdminsRow = {
  id: number;
  created_at?: string;
};

// ---- Helpers: row → app type ----
function eventsRowToEvent(row: EventsRow, tables: Table[]): EventData {
  let imageUrl = row.image_url ?? '';
  if (row.poster_image_path && supabase) {
    const { data } = supabase.storage.from('posters').getPublicUrl(row.poster_image_path);
    imageUrl = data.publicUrl;
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    date: row.date ?? new Date().toISOString(),
    event_date: row.event_date ?? null,
    event_time: row.event_time ?? null,
    venue: row.venue ?? null,
    // poster_image_path → imageUrl when set; else image_url
    imageUrl,
    // layout_image_url → layoutImageUrl: seating only (рассадка)
    layoutImageUrl: row.layout_image_url ?? null,
    ticketTemplateUrl: row.ticket_template_url ?? null,
    schemaImageUrl: null,
    paymentPhone: row.organizer_phone ?? '',
    maxSeatsPerBooking: 4,
    tables,
    status: row.published ? 'published' : 'draft',
    published: row.published ?? false,
    isFeatured: row.is_featured ?? false,
    ticketCategories: row.ticket_categories ?? undefined,
    organizerId: row.organizer_id ?? undefined,
  };
}

function eventTablesRowToTable(row: EventTablesRow, bookedSeats?: number): Table {
  const seatsTotal = Number(row.seats_total) || 0;
  const seatsAvailable = bookedSeats != null
    ? Math.max(0, seatsTotal - bookedSeats)
    : seatsTotal;
  const t: Table = {
    id: row.id,
    number: row.number,
    seatsTotal,
    seatsAvailable,
    isAvailable: row.is_available ?? false,
    is_active: row.is_active !== false,
    x: row.x ?? 0,
    y: row.y ?? 0,
    centerX: row.center_x ?? row.x ?? 0,
    centerY: row.center_y ?? row.y ?? 0,
  };
  if (row.size_percent != null) t.sizePercent = row.size_percent;
  if (row.width_percent != null) t.widthPercent = row.width_percent;
  if (row.height_percent != null) t.heightPercent = row.height_percent;
  if (row.rotation_deg != null) t.rotationDeg = row.rotation_deg;
  if (row.shape != null) t.shape = row.shape;
  if (row.color != null) t.color = row.color;
  if (row.visible_from != null) t.visibleFrom = row.visible_from;
  if (row.visible_until != null) t.visibleUntil = row.visible_until;
  if (row.ticket_category_id != null) t.ticketCategoryId = row.ticket_category_id;
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
    totalAmount: Number(row.total_amount) || 0,
    status: row.status as BookingStatus,
    createdAt,
  };
  if (row.table_id != null) booking.tableId = row.table_id;
  if (row.ticket_file_url != null) booking.ticketFileUrl = row.ticket_file_url;
  if (row.is_used != null) booking.isUsed = row.is_used;
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

/** Reassign featured event: only published future events are eligible. */
export async function reassignFeaturedIfNeeded(): Promise<void> {
  if (!supabase) return;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: featuredRow, error: featErr } = await supabase
    .from('events')
    .select('id, event_date, published')
    .eq('is_featured', true)
    .limit(1)
    .maybeSingle();

  const { data: nearestFuture, error: nextErr } = await supabase
    .from('events')
    .select('id')
    .eq('published', true)
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextErr) return;

  // Case A — No featured exists
  if (featErr || !featuredRow) {
    if (nearestFuture) {
      const { data: allIds } = await supabase.from('events').select('id');
      if (allIds?.length) {
        await supabase.from('events').update({ is_featured: false }).in('id', allIds.map((r) => r.id));
        await supabase.from('events').update({ is_featured: true }).eq('id', nearestFuture.id);
      }
    }
    return;
  }

  // Case B — Featured exists but expired or unpublished
  const eventDate = featuredRow.event_date as string | null;
  const published = featuredRow.published === true;
  const isExpired = eventDate != null && eventDate < today;
  const isInvalid = !published || isExpired;

  if (isInvalid) {
    await supabase.from('events').update({ is_featured: false }).eq('id', featuredRow.id);
    if (nearestFuture) {
      await supabase.from('events').update({ is_featured: true }).eq('id', nearestFuture.id);
    }
  }
  // Case C — Featured valid: do nothing
}

// ---- Events ----
export async function getEvents(): Promise<EventData[]> {
  if (!supabase) return [];
  const { data: eventsRows, error: eventsErr } = await supabase.from('events').select('*').order('created_at', { ascending: false });
  if (eventsErr) throw eventsErr;
  if (!eventsRows?.length) return [];

  // Load all event_tables (no filtering by is_available, is_active, visible_from, visible_until)
  const { data: tablesRows, error: tablesErr } = await supabase
    .from('event_tables')
    .select('*')
    .order('event_id', { ascending: true })
    .order('number', { ascending: true });
  if (tablesErr) throw tablesErr;
  const tablesByEventId = (tablesRows ?? []).reduce<Record<string, EventTablesRow[]>>((acc, r) => {
    const row = r as EventTablesRow;
    const arr = acc[row.event_id] ?? [];
    arr.push(row);
    acc[row.event_id] = arr;
    return acc;
  }, {});

  const eventIds = (eventsRows as EventsRow[]).map((r) => r.id);
  const bookedByEvents = await getBookedSeatsByEvents(eventIds);

  return (eventsRows as EventsRow[]).map((row) => {
    const event = eventsRowToEvent(row, []);
    const bookedByTable = bookedByEvents[event.id] ?? {};
    const tablesFromEventTables = (tablesByEventId[event.id] ?? []).map((r) => {
      const etRow = r as EventTablesRow;
      return eventTablesRowToTable(etRow, bookedByTable[etRow.id] ?? 0);
    });
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

  // 2. Rebuild tables from event_tables (all tables, no filtering by is_available, is_active, visible_from, visible_until)
  const { data: tablesRows, error: tablesErr } = await supabase
    .from('event_tables')
    .select('*')
    .eq('event_id', event.id)
    .eq('is_active', true)
    .order('number', { ascending: true });
  if (tablesErr) return undefined;

  const bookedByTable = await getBookedSeatsByTable(event.id);
  const tablesFromEventTables = (tablesRows ?? []).map((r) => {
    const etRow = r as EventTablesRow;
    return eventTablesRowToTable(etRow, bookedByTable[etRow.id] ?? 0);
  });

  event.tables = tablesFromEventTables;
  return event;
}

export async function saveEvents(events: EventData[]): Promise<void> {
  if (!supabase) return;
  for (const event of events) {
    await upsertEvent(event);
  }
}

/** Get booked seats per table_id for an event (reserved/awaiting_confirmation/paid only). SUM(seats_booked). */
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

/** Get booked seats per event_id -> table_id for multiple events (batch). */
async function getBookedSeatsByEvents(eventIds: string[]): Promise<Record<string, Record<string, number>>> {
  if (!supabase || eventIds.length === 0) return {};
  const { data } = await supabase
    .from('bookings')
    .select('event_id, table_id, seat_indices, seats_booked')
    .in('event_id', eventIds)
    .in('status', ['reserved', 'awaiting_confirmation', 'paid']);
  const out: Record<string, Record<string, number>> = {};
  for (const b of data ?? []) {
    const eventId = b.event_id;
    const tableId = b.table_id;
    if (!eventId || !tableId) continue;
    const seats = b.seats_booked ?? (Array.isArray(b.seat_indices) ? b.seat_indices.length : 0) ?? 0;
    const byTable = out[eventId] ?? (out[eventId] = {});
    byTable[tableId] = (byTable[tableId] ?? 0) + Number(seats);
  }
  return out;
}

/** Log layout change to audit table. NEVER throws — logs and swallows errors. */
function logLayoutChange(
  eventId: string,
  tableId: string,
  action: 'create' | 'update' | 'deactivate',
  previousData: Record<string, unknown> | null,
  newData: Record<string, unknown>,
  adminId?: number
): void {
  if (!supabase) return;
  void (async () => {
    try {
      const { error } = await supabase.from('layout_changes').insert({
        event_id: eventId,
        table_id: tableId,
        action,
        previous_data: previousData,
        new_data: newData,
        admin_id: adminId ?? null,
      });
      if (error) console.error('[layout_changes] log failed:', error);
    } catch (err) {
      console.error('[layout_changes] log failed:', err);
    }
  })();
}

export async function upsertEvent(event: EventData, adminId?: number): Promise<void> {
  if (!supabase) return;
  // image_url — poster (event banner / cover image); layout_image_url — seating only (рассадка)
  const isFeatured = (event as { isFeatured?: boolean }).isFeatured === true;
  if (isFeatured) {
    // Ensure only one featured event: unset all others first
    const { error: unsetErr } = await supabase
      .from('events')
      .update({ is_featured: false })
      .neq('id', event.id);
    if (unsetErr) throw unsetErr;
  }

  const organizerId = (event as { organizerId?: number | null }).organizerId ?? adminId ?? null;
  const row: Omit<EventsRow, 'created_at' | 'updated_at'> = {
    id: event.id,
    title: event.title,
    description: event.description || null,
    date: event.date || null,
    event_date: event.event_date ?? null,
    event_time: event.event_time ?? null,
    venue: event.venue ?? null,
    image_url: event.imageUrl || null,
    layout_image_url: event.layoutImageUrl ?? null,
    organizer_phone: event.paymentPhone || null,
    organizer_id: organizerId,
    published: event.published ?? false,
    is_featured: isFeatured,
    ticket_categories: event.ticketCategories ?? null,
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
      .select('id, seats_total, is_active, number, x, y, center_x, center_y, size_percent, shape, color, is_available')
      .eq('id', tableId)
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing) {
      // UPDATE: seats_total (never below booked), seats_available = seats_total - booked, is_active
      const seatsTotalClamped = Math.max(booked, seatsTotal);
      const seatsAvailable = Math.max(0, seatsTotalClamped - booked);
      const wantsActive = (t as { is_active?: boolean }).is_active !== false;

      if (!wantsActive && booked > 0) {
        throw new Error('Cannot deactivate table with active bookings');
      }

      const visFrom = (t as { visibleFrom?: string | null }).visibleFrom ?? null;
      const visUntil = (t as { visibleUntil?: string | null }).visibleUntil ?? null;
      const { error: updErr } = await supabase
        .from('event_tables')
        .update({
          number: t.number ?? 1,
          seats_total: seatsTotalClamped,
          seats_available: seatsAvailable,
          center_x: t.centerX ?? t.x ?? null,
          center_y: t.centerY ?? t.y ?? null,
          size_percent: t.sizePercent ?? null,
          width_percent: (t as { widthPercent?: number }).widthPercent ?? null,
          height_percent: (t as { heightPercent?: number }).heightPercent ?? null,
          rotation_deg: (t as { rotationDeg?: number }).rotationDeg ?? null,
          shape: t.shape ?? null,
          color: t.color ?? null,
          is_available: t.isAvailable ?? false,
          is_active: wantsActive,
          visible_from: visFrom || null,
          visible_until: visUntil || null,
          ticket_category_id: t.ticketCategoryId ?? null,
        })
        .eq('id', tableId)
        .eq('event_id', event.id);

      if (updErr) {
        console.error('[EVENT_TABLE UPDATE FAILED]', { eventId: event.id, tableId, error: updErr });
        throw updErr;
      }

      const prevTotal = Number((existing as { seats_total?: number }).seats_total) || 0;
      if (prevTotal !== seatsTotalClamped) {
        logLayoutChange(
          event.id,
          tableId,
          'update',
          { seats_total: prevTotal },
          { seats_total: seatsTotalClamped },
          adminId
        );
      }
    } else {
      // INSERT new row: seats_available = seats_total - bookedSeats
      const seatsTotalClamped = Math.max(booked, seatsTotal);
      const seatsAvailable = Math.max(0, seatsTotalClamped - booked);
      const visFrom = (t as { visibleFrom?: string | null }).visibleFrom ?? null;
      const visUntil = (t as { visibleUntil?: string | null }).visibleUntil ?? null;
      const { error: insErr } = await supabase.from('event_tables').insert({
        id: tableId,
        event_id: event.id,
        number: t.number ?? 1,
        seats_total: seatsTotalClamped,
        seats_available: seatsAvailable,
        center_x: t.centerX ?? t.x ?? null,
        center_y: t.centerY ?? t.y ?? null,
        size_percent: t.sizePercent ?? null,
        width_percent: (t as { widthPercent?: number }).widthPercent ?? null,
        height_percent: (t as { heightPercent?: number }).heightPercent ?? null,
        rotation_deg: (t as { rotationDeg?: number }).rotationDeg ?? null,
        shape: t.shape ?? null,
        color: t.color ?? null,
        is_available: t.isAvailable ?? false,
        is_active: true,
        visible_from: visFrom || null,
        visible_until: visUntil || null,
        ticket_category_id: t.ticketCategoryId ?? null,
      });

      if (insErr) {
        console.error('[EVENT_TABLE INSERT FAILED]', { eventId: event.id, table: t, error: insErr });
        throw insErr;
      }
      logLayoutChange(
        event.id,
        tableId,
        'create',
        null,
        { id: tableId, event_id: event.id, seats_total: seatsTotalClamped, number: t.number ?? 1 },
        adminId
      );
    }
  }

  // 2. Mark tables not in incoming list as is_active = false (never delete)
  const { data: allTables } = await supabase
    .from('event_tables')
    .select('id, seats_total, is_active, number, x, y, center_x, center_y, size_percent, shape, color, is_available')
    .eq('event_id', event.id);

  const toDeactivate = (allTables ?? []).filter((row) => !incomingIds.has(row.id));
  for (const row of toDeactivate) {
    const { count, error: countErr } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('table_id', row.id)
      .in('status', ['reserved', 'awaiting_confirmation', 'paid']);
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) {
      throw new Error('Cannot deactivate table with active bookings');
    }
  }

  for (const row of toDeactivate) {
    const prev = row as Record<string, unknown>;
    const { error: updErr } = await supabase
      .from('event_tables')
      .update({ is_active: false })
      .eq('id', row.id)
      .eq('event_id', event.id);
    if (updErr) throw updErr;
    logLayoutChange(
      event.id,
      row.id,
      'deactivate',
      { ...prev, is_active: prev.is_active ?? true },
      { ...prev, is_active: false },
      adminId
    );
  }

  console.log('[UPSERT EVENT]', 'event_id:', event.id, 'tables:', incomingTables.length);
}

/** Delete event by id. Cascades to event_tables and bookings via FK. */
export async function deleteEvent(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
  return true;
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
    total_amount: booking.totalAmount,
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

export async function updateBookingTicketFileUrl(bookingId: string, ticketFileUrl: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('bookings').update({ ticket_file_url: ticketFileUrl }).eq('id', bookingId);
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
