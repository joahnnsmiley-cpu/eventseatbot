/**
 * One-time migration: import backend/data.json into Supabase Postgres.
 * Uses Supabase client directly. Order: admins → events → event_tables → bookings.
 * Run from backend: npx ts-node scripts/import-data-json-to-supabase.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

const dataPath = path.join(__dirname, '..', 'data.json');
const raw = fs.readFileSync(dataPath, 'utf-8');
const data = JSON.parse(raw) as {
  admins?: Array<{ id: number }>;
  events?: Array<{
    id: string;
    title: string;
    description?: string;
    date?: string;
    imageUrl?: string;
    layoutImageUrl?: string | null;
    paymentPhone?: string;
    published?: boolean;
    status?: string;
    tables?: Array<{
      id: string;
      number: number;
      seatsTotal: number;
      seatsAvailable: number;
      x?: number;
      y?: number;
      centerX?: number;
      centerY?: number;
      sizePercent?: number;
      shape?: string;
      color?: string;
    }>;
  }>;
  bookings?: Array<{
    id: string;
    eventId: string;
    tableId?: string;
    userTelegramId?: number;
    userPhone?: string;
    seatIndices?: number[];
    seatsBooked?: number;
    status: string;
    createdAt?: number;
    expiresAt?: string | number;
  }>;
};

const admins = Array.isArray(data.admins) ? data.admins : [];
const events = Array.isArray(data.events) ? data.events : [];
const bookings = Array.isArray(data.bookings) ? data.bookings : [];

async function run(): Promise<void> {
  // Clear existing data (order respects FKs: bookings → event_tables → events → admins)
  const { error: errBookings } = await supabase.from('bookings').delete().neq('id', '');
  if (errBookings) {
    console.error('bookings delete error:', errBookings);
    throw errBookings;
  }
  const { error: errEventTables } = await supabase.from('event_tables').delete().neq('id', '');
  if (errEventTables) {
    console.error('event_tables delete error:', errEventTables);
    throw errEventTables;
  }
  const { error: errEvents } = await supabase.from('events').delete().neq('id', '');
  if (errEvents) {
    console.error('events delete error:', errEvents);
    throw errEvents;
  }
  const { error: errAdmins } = await supabase.from('admins').delete().gte('id', 0);
  if (errAdmins) {
    console.error('admins delete error:', errAdmins);
    throw errAdmins;
  }
  console.log('[Import] Cleared existing Supabase tables');

  let adminsCount = 0;
  let eventsCount = 0;
  let eventTablesCount = 0;
  let bookingsCount = 0;

  // 1. admins → admins
  for (const a of admins) {
    const { error } = await supabase.from('admins').insert({ id: a.id });
    if (error) {
      console.error('admins insert error:', error);
      throw error;
    }
    adminsCount++;
  }

  // 2. events → events
  for (const e of events) {
    const row = {
      id: e.id,
      title: e.title ?? '',
      description: e.description ?? null,
      date: e.date ?? null,
      image_url: e.imageUrl ?? null,
      layout_image_url: e.layoutImageUrl ?? null,
      organizer_phone: e.paymentPhone ?? null,
      published: e.published === true || e.status === 'published',
    };
    const { error } = await supabase.from('events').insert(row);
    if (error) {
      console.error('events insert error:', error);
      throw error;
    }
    eventsCount++;
  }

  // 3. event.tables → event_tables
  for (const e of events) {
    const tables = Array.isArray(e.tables) ? e.tables : [];
    for (const t of tables) {
      const row = {
        id: t.id,
        event_id: e.id,
        number: t.number,
        seats_total: t.seatsTotal,
        seats_available: t.seatsAvailable,
        x: t.x ?? null,
        y: t.y ?? null,
        center_x: t.centerX ?? null,
        center_y: t.centerY ?? null,
        size_percent: t.sizePercent ?? null,
        width_percent: (t as { widthPercent?: number }).widthPercent ?? null,
        height_percent: (t as { heightPercent?: number }).heightPercent ?? null,
        rotation_deg: (t as { rotationDeg?: number }).rotationDeg ?? null,
        shape: t.shape ?? null,
        color: t.color ?? null,
        is_available: (t as { isAvailable?: boolean }).isAvailable ?? false,
      };
      const { error } = await supabase.from('event_tables').insert(row);
      if (error) {
        console.error('event_tables insert error:', error);
        throw error;
      }
      eventTablesCount++;
    }
  }

  // 4. bookings → bookings
  for (const b of bookings) {
    const createdAt = b.createdAt != null
      ? (typeof b.createdAt === 'number' ? new Date(b.createdAt).toISOString() : new Date(b.createdAt).toISOString())
      : new Date().toISOString();
    const expiresAt = b.expiresAt != null
      ? (typeof b.expiresAt === 'number' ? new Date(b.expiresAt).toISOString() : b.expiresAt)
      : null;
    const row = {
      id: b.id,
      event_id: b.eventId,
      table_id: b.tableId ?? null,
      user_telegram_id: b.userTelegramId ?? null,
      user_phone: b.userPhone ?? null,
      seat_indices: b.seatIndices ?? null,
      seats_booked: b.seatsBooked ?? null,
      status: b.status,
      created_at: createdAt,
      expires_at: expiresAt,
    };
    const { error } = await supabase.from('bookings').insert(row);
    if (error) {
      console.error('bookings insert error:', error);
      throw error;
    }
    bookingsCount++;
  }

  console.log('[Import] admins:', adminsCount);
  console.log('[Import] events:', eventsCount);
  console.log('[Import] event_tables:', eventTablesCount);
  console.log('[Import] bookings:', bookingsCount);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
