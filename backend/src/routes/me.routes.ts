import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../auth/auth.middleware';
import { db } from '../db';
import { bot } from '../bot';
import { getPremiumUserInfo } from '../config/premium';
import { formatEventDateRu, parseEventToIso } from '../utils/formatDate';

const router = Router();
const API_BASE = process.env.API_BASE_URL || 'http://localhost:4000';

/** Parse comment into guest names (comma-separated). */
function parseCommentNames(comment: string | null | undefined): string[] {
  if (!comment || typeof comment !== 'string') return [];
  return comment
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Premium default avatar path — served by frontend from public/avatar-default.png */
const DEFAULT_AVATAR_PATH = '/avatar-default.png';

/**
 * GET /me/avatar/:tgId — proxy Telegram user profile photo.
 * Public (no auth) — img src cannot send Authorization; tgId is not secret.
 */
router.get('/avatar/:tgId', async (req, res) => {
  const tgId = req.params.tgId;
  if (!tgId || !/^\d+$/.test(tgId)) return res.status(400).send('Invalid tgId');

  if (!bot) return res.status(404).send('Avatar not available');

  try {
    const photos = await bot.telegram.getUserProfilePhotos(Number(tgId), 0, 1);
    const photo = photos?.photos?.[0]?.[0];
    if (!photo?.file_id) return res.status(404).send('No photo');

    const fileLink = await bot.telegram.getFileLink(photo.file_id);
    const imgRes = await fetch(fileLink.href);
    if (!imgRes.ok) return res.status(502).send('Failed to fetch avatar');

    const buf = Buffer.from(await imgRes.arrayBuffer());
    res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch {
    res.status(404).send('Avatar not found');
  }
});

/**
 * GET /me/user — current user info (isPremium, premiumMessage for premium users).
 */
router.get('/user', authMiddleware, async (req: AuthRequest, res) => {
  const user = req.user;
  if (!user || typeof user.id === 'undefined') return res.status(401).json({ error: 'Unauthorized' });
  const info = getPremiumUserInfo(user.id);
  if (info.isPremium) {
    return res.json({ isPremium: true, premiumMessage: info.premiumMessage ?? null });
  }
  return res.json({ isPremium: false });
});

const mapBooking = (b: any, events: any[]) => {
  const event = events.find((e) => e.id === b.eventId);
  const eventInfo = event
    ? { id: event.id, title: event.title, date: event.date }
    : { id: b.eventId };

  const resolveTable = (tableId?: string) => {
    if (!event || !tableId) return null;
    const table = Array.isArray(event.tables) ? event.tables.find((t: any) => t.id === tableId) : null;
    if (!table) return null;
    return {
      id: table.id,
      number: table.number,
      seatsTotal: table.seatsTotal,
    };
  };

  const tableInfo = b.tableId ? resolveTable(b.tableId) : null;
  const tableBookings = Array.isArray(b.tableBookings)
    ? b.tableBookings.map((tb: any) => ({
      tableId: tb.tableId,
      seats: tb.seats,
      table: resolveTable(tb.tableId),
    }))
    : undefined;

  const seatCount = Array.isArray(b.seatIds) && b.seatIds.length > 0
    ? b.seatIds.length
    : typeof b.seatsBooked === 'number'
      ? b.seatsBooked
      : tableBookings
        ? tableBookings.reduce((sum: number, tb: any) => sum + (Number(tb.seats) || 0), 0)
        : 0;

  return {
    id: b.id,
    event: eventInfo,
    table: tableInfo,
    tableBookings,
    seatIds: Array.isArray(b.seatIds) ? b.seatIds : [],
    seatsCount: seatCount,
    status: b.status,
    createdAt: b.createdAt,
    expiresAt: b.expiresAt,
    totalAmount: b.totalAmount,
    userPhone: b.userPhone,
    tickets: b.status === 'paid' ? (Array.isArray(b.tickets) ? b.tickets : []) : undefined,
    ticketFileUrl: b.ticketFileUrl ?? b.ticket_file_url ?? null,
  };
};

/**
 * All bookings (reserved + paid)
 */
router.get('/bookings', authMiddleware, async (req: AuthRequest, res) => {
  const user = req.user;
  if (!user || typeof user.id === 'undefined') return res.status(401).json({ error: 'Unauthorized' });
  const userId = String(user.id);
  const events = await db.getEvents();
  const all = await db.getBookings();
  const userBookings = all.filter(
    (b: any) => String(b.userTelegramId ?? '') === userId && (b.status === 'reserved' || b.status === 'paid'),
  );

  res.json(userBookings.map((b: any) => mapBooking(b, events)));
});

/**
 * Purchased tickets (paid)
 */
router.get('/tickets', authMiddleware, async (req: AuthRequest, res) => {
  const user = req.user;
  if (!user || typeof user.id === 'undefined') return res.status(401).json({ error: 'Unauthorized' });
  const userId = String(user.id);
  const events = await db.getEvents();
  const all = await db.getBookings();
  const tickets = all.filter((b: any) => String(b.userTelegramId ?? '') === userId && b.status === 'paid');

  res.json(tickets.map((b: any) => mapBooking(b, events)));
});

/**
 * GET /me/profile-guest — data for ProfileGuestScreen.
 * Returns current user's active booking with event, table, category, neighbors.
 * If no booking: { hasBooking: false }.
 */
router.get('/profile-guest', authMiddleware, async (req: AuthRequest, res) => {
  const user = req.user;
  if (!user || typeof user.id === 'undefined') return res.status(401).json({ error: 'Unauthorized' });
  const userId = String(user.id);

  const events = await db.getEvents();
  const allBookings = await db.getBookings();
  const userBookings = allBookings.filter(
    (b: any) => String(b.userTelegramId ?? '') === userId && (b.status === 'reserved' || b.status === 'paid')
  );

  if (userBookings.length === 0) {
    return res.json({ hasBooking: false });
  }

  const booking = userBookings[0];
  if (!booking) return res.json({ hasBooking: false });
  const eventId = booking.eventId;
  const tableId = booking.tableId;
  if (!eventId || !tableId) {
    return res.json({ hasBooking: false });
  }

  const event = events.find((e: any) => e.id === eventId);
  if (!event) return res.json({ hasBooking: false });

  const table = Array.isArray(event.tables) ? event.tables.find((t: any) => t.id === tableId) : null;
  if (!table) return res.json({ hasBooking: false });

  const categoryId = table.ticketCategoryId;
  const categories = (event as any).ticketCategories ?? [];
  const category = Array.isArray(categories) ? categories.find((c: any) => c.id === categoryId) : null;

  const tableBookings = allBookings.filter(
    (b: any) => b.eventId === eventId && b.tableId === tableId && (b.status === 'reserved' || b.status === 'paid')
  );
  const neighborBookings = tableBookings.filter((b: any) => String(b.userTelegramId ?? '') !== userId);

  const neighbors: Array<{ name: string; avatar: string }> = [];
  for (const b of neighborBookings) {
    const raw = b as any;
    const comment = raw.userComment ?? raw.user_comment ?? '';
    const names = parseCommentNames(comment);
    const displayNames = names.length > 0 ? names : [raw.username?.trim() || 'Гость'];
    const tgId = raw.userTelegramId ?? raw.user_telegram_id;
    const buyerAvatarUrl = bot && tgId != null ? `${API_BASE}/me/avatar/${tgId}` : null;

    displayNames.forEach((name, idx) => {
      const avatar = idx === 0 && buyerAvatarUrl ? buyerAvatarUrl : DEFAULT_AVATAR_PATH;
      neighbors.push({ name, avatar });
    });
  }

  const eventDate = (event as any).event_date ?? null;
  const eventTime = (event as any).event_time ?? null;
  const offset = (event as any).timezoneOffsetMinutes ?? 180;
  const startAt = parseEventToIso(eventDate, eventTime, offset) ?? (event as any).date ?? null;

  const seatIndices = booking.seatIndices ?? [];
  const seatNumbers = seatIndices.map((i: number) => i + 1);

  const privileges = (category as any)?.privileges;
  const privilegesList = Array.isArray(privileges) ? privileges : [];

  const avatarUrl = bot ? `${API_BASE}/me/avatar/${userId}` : DEFAULT_AVATAR_PATH;

  res.json({
    hasBooking: true,
    guestName: 'Гость',
    avatarUrl,
    event: {
      name: event.title,
      title: event.title,
      start_at: startAt,
      date: formatEventDateRu(eventDate, eventTime || '00:00:00', (event as any).timezoneOffsetMinutes ?? 180),
      venue: (event as any).venue ?? '',
    },
    tableNumber: table.number ?? 0,
    categoryName: category?.name ?? '',
    categoryColorKey: (category as any)?.color_key ?? 'gold',
    seatNumbers,
    seatsFree: table.seatsAvailable ?? 0,
    neighbors,
    privileges: privilegesList,
    privateAccess: (category as any)?.description ?? '',
  });
});

/** VIP category: color_key === 'vip' or name contains "vip" (case-insensitive). */
function isVipCategory(cat: { color_key?: string; name?: string } | null | undefined): boolean {
  if (!cat) return false;
  const key = (cat.color_key ?? '').toLowerCase();
  const name = (cat.name ?? '').toLowerCase();
  return key === 'vip' || name.includes('vip');
}

/**
 * GET /me/profile-organizer — data for ProfileOrganizerScreen.
 * Query: ?eventId=xxx (optional). If omitted: first event where user is organizer or admin sees first event.
 * Returns { hasData: false } when no event found.
 */
router.get('/profile-organizer', authMiddleware, async (req: AuthRequest, res) => {
  const user = req.user;
  if (!user || typeof user.id === 'undefined') return res.status(401).json({ error: 'Unauthorized' });
  const userId = String(user.id);
  const isAdmin = req.user?.role === 'admin' || (process.env.ADMINS_IDS || '').split(',').map((id) => id.trim()).filter(Boolean).includes(userId);
  const eventIdParam = typeof req.query?.eventId === 'string' ? req.query.eventId.trim() : '';

  const events = await db.getEvents();
  const allBookings = await db.getBookings();
  const admins = await db.getAdmins();
  const adminIds = new Set(admins.map((a) => String(a.id)));

  let event: any = null;
  if (eventIdParam) {
    event = events.find((e: any) => e.id === eventIdParam);
    if (event) {
      const organizerId = (event as any).organizerId ?? (event as any).organizer_id;
      const canAccess = organizerId != null && String(organizerId) === userId
        || isAdmin || adminIds.has(userId);
      if (!canAccess) event = null;
    }
  }
  if (!event && events.length > 0) {
    const asOrganizer = events.find((e: any) => {
      const oid = (e as any).organizerId ?? (e as any).organizer_id;
      return oid != null && String(oid) === userId;
    });
    if (asOrganizer) {
      event = asOrganizer;
    } else if (isAdmin || adminIds.has(userId)) {
      const validStatuses = ['reserved', 'paid', 'awaiting_confirmation', 'payment_submitted', 'confirmed'];
      const withBookings = events
        .map((e: any) => ({
          event: e,
          count: allBookings.filter((b: any) => (b.eventId ?? b.event_id) === e.id && validStatuses.includes(String(b.status ?? ''))).length,
        }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count);
      event = withBookings.length > 0 ? withBookings[0]!.event : (events.find((e: any) => (e as any).isFeatured) ?? events[0]!);
    }
  }

  if (!event) {
    return res.json({ hasData: false });
  }

  const eventId = event.id;
  const tables = Array.isArray(event.tables) ? event.tables : [];
  const validStatuses = ['reserved', 'paid', 'awaiting_confirmation', 'payment_submitted', 'confirmed', 'pending'];
  const eventBookings = allBookings.filter(
    (b: any) => {
      const eid = b.eventId ?? b.event_id;
      const st = String(b.status ?? '');
      return eid === eventId && validStatuses.includes(st);
    }
  );

  const getSeatCount = (b: any): number => {
    const n = b.seatsBooked ?? (b as any).seats_booked ?? (Array.isArray(b.seatIndices) ? b.seatIndices.length : 0) ?? (Array.isArray((b as any).seat_indices) ? (b as any).seat_indices.length : 0);
    if (n != null && Number(n) > 0) return Number(n);
    const tb = b.tableBookings ?? (b as any).table_bookings;
    if (Array.isArray(tb) && tb.length > 0) return tb.reduce((s: number, x: any) => s + (Number(x.seats) || 0), 0);
    return 1;
  };

  const totalGuests = eventBookings.reduce((sum: number, b: any) => sum + getSeatCount(b), 0);

  const totalSeats = tables.reduce((s: number, t: any) => s + (Number(t.seatsTotal) || 0), 0);
  const seatsFree = Math.max(0, totalSeats - totalGuests);
  const occupancyPercent = totalSeats > 0 ? Math.round((totalGuests / totalSeats) * 100) : 0;

  const bookedByTable: Record<string, number> = {};
  for (const b of eventBookings) {
    const tid = b.tableId ?? (b as any).table_id;
    if (tid) {
      const n = getSeatCount(b);
      bookedByTable[tid] = (bookedByTable[tid] ?? 0) + n;
    } else {
      const tb = b.tableBookings ?? (b as any).table_bookings;
      if (Array.isArray(tb)) {
        for (const x of tb) {
          const tbid = x.tableId ?? x.table_id;
          if (tbid) bookedByTable[tbid] = (bookedByTable[tbid] ?? 0) + (Number(x.seats) || 0);
        }
      }
    }
  }

  let fullTables = 0;
  let partialTables = 0;
  let emptyTables = 0;
  for (const t of tables) {
    const booked = bookedByTable[t.id] ?? 0;
    const total = Number(t.seatsTotal) || 0;
    if (total === 0) continue;
    if (booked >= total) fullTables++;
    else if (booked > 0) partialTables++;
    else emptyTables++;
  }

  const categories = (event as any).ticketCategories ?? [];
  const vipCategoryIds = new Set(
    (Array.isArray(categories) ? categories : [])
      .filter((c: any) => isVipCategory(c))
      .map((c: any) => c.id)
  );

  const tableIdToCategoryId: Record<string, string> = {};
  for (const t of tables) {
    if (t.ticketCategoryId) tableIdToCategoryId[t.id] = t.ticketCategoryId;
  }

  const categoryIdToName: Record<string, string> = {};
  for (const c of Array.isArray(categories) ? categories : []) {
    if (c?.id) categoryIdToName[c.id] = (c as any).name ?? (c as any).color_key ?? 'VIP';
  }

  const vipGuests: Array<{ name: string; category: string }> = [];
  for (const b of eventBookings) {
    const catId = b.tableId ? tableIdToCategoryId[b.tableId] : null;
    if (!catId || !vipCategoryIds.has(catId)) continue;
    const catName = categoryIdToName[catId] ?? 'VIP';
    const name = (b as any).username?.trim() || (b as any).userPhone || 'Гость';
    vipGuests.push({ name, category: catName });
  }

  const eventDate = (event as any).event_date ?? null;
  const eventTime = (event as any).event_time ?? null;
  const offset = (event as any).timezoneOffsetMinutes ?? 180;
  const eventDateIso = parseEventToIso(eventDate, eventTime, offset) ?? (event as any).date ?? null;

  res.json({
    hasData: true,
    eventDate: eventDateIso,
    stats: {
      guestsTotal: totalGuests,
      fillPercent: occupancyPercent,
      ticketsSold: totalGuests,
      seatsFree,
    },
    tables: {
      total: tables.length,
      full: fullTables,
      partial: partialTables,
      empty: emptyTables,
    },
    vipGuests,
  });
});

export default router;
