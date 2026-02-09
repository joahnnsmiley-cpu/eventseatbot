import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { v4 as uuid } from 'uuid';
import type { EventData } from './models';
import { getEvents, findEventById, saveEvents, getBookings, addBooking, upsertEvent } from './db';
import { bot, notifyAdminsAboutBooking, notifyUser } from './bot';
import adminEventsRouter from './routes/adminEvents';
import adminSeatsRouter, { seats as inMemorySeats } from './routes/adminSeats';
import adminBookingsRouter from './routes/adminBookings';
import publicEventsRouter from './routes/publicEvents';
import publicPaymentsRouter from './routes/publicPayments';
import adminPaymentsRouter from './routes/adminPayments';
import { inMemoryBookings } from './state';
import { authMiddleware, AuthRequest } from './auth/auth.middleware';
import 'dotenv/config';
import authRoutes from './auth/auth.routes';
import meRoutes from './routes/me.routes';
import { setBookingEventNotifier } from './domain/bookings';
import { setPaymentEventNotifier } from './domain/payments';
import { TelegramBookingNotifier } from './infra/telegram';
import { TelegramPaymentNotifier } from './infra/telegram/telegram.payment-notifier';
import { startBookingExpirationJob } from './infra/scheduler';


const app = express();
const PORT = process.env.PORT || 4000;

/**
 * ==============================
 * BOOTSTRAP: Initialize Infrastructure
 * ==============================
 */

// Wire Telegram notifier into booking events (if env vars exist)
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

if (token && chatId) {
  const telegramBookingNotifier = new TelegramBookingNotifier();
  setBookingEventNotifier(telegramBookingNotifier);
  console.log('[Bootstrap] Telegram booking notifier initialized');

  const telegramPaymentNotifier = new TelegramPaymentNotifier();
  setPaymentEventNotifier(telegramPaymentNotifier);
  console.log('[Bootstrap] Telegram payment notifier initialized');
} else {
  console.log('[Bootstrap] Telegram notifiers disabled: missing env vars');
}

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(bodyParser.json());
app.use('/auth', authRoutes);
app.use('/me', meRoutes);

/**
 * ==============================
 * TELEGRAM WEBHOOK ENDPOINT
 * ==============================
 * Telegram будет слать POST сюда
 */
app.post('/telegram/webhook', (req, res) => {
  if (bot) {
    bot.handleUpdate(req.body);
  }
  res.sendStatus(200);
});

// Seed a single published event for dev/preview or explicit flag.
const seedTestEvent = () => {
  const shouldSeed = process.env.SEED_TEST_EVENT === 'true' || process.env.NODE_ENV !== 'production';
  if (!shouldSeed) return;

  const seedId = 'seed-public-event';
  const existing = findEventById(seedId);
  if (existing) return;

  const base: EventData = {
    id: seedId,
    title: 'Test Event',
    description: 'Seeded event for WebApp preview',
    date: new Date().toISOString(),
    imageUrl: 'https://picsum.photos/800/600',
    schemaImageUrl: null,
    layoutImageUrl: null,
    paymentPhone: '79990000000',
    maxSeatsPerBooking: 4,
    tables: [],
    status: 'draft',
    published: false,
  };

  upsertEvent(base);
  upsertEvent({ ...base, status: 'published', published: true });
};

seedTestEvent();

// ==============================
// EVENTS
// ==============================
app.get('/events', (_req, res) => {
  const events = getEvents().filter((e: any) => e?.published === true || e?.status === 'published');
  res.json(events);
});

app.get('/events/:eventId', (req, res) => {
  const event = findEventById(req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if ((event as any).published !== true && (event as any).status !== 'published') {
    return res.status(404).json({ error: 'Event not found' });
  }
  res.json(event);
});

// ==============================
// CREATE BOOKING (user-facing)
// ==============================
app.post('/bookings', authMiddleware, async (req: AuthRequest, res) => {
  const user = req.user;
  const userIdVal = user?.id ?? user?.sub ?? user?.userId;
  if (!userIdVal) return res.status(401).json({ error: 'Unauthorized' });
  const userId = String(userIdVal);

  const body = req.body || {};
  const eventId = body.eventId as string | undefined;
  const userPhone = typeof body.userPhone === 'string' ? body.userPhone.trim() : '';

  if (!eventId) return res.status(400).json({ error: 'eventId is required' });
  if (!userPhone) return res.status(400).json({ error: 'userPhone is required' });

  // Validate event exists
  const event = findEventById(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Support two booking types for compatibility:
  // 1) seatIds: array of individual seat ids (legacy)
  // 2) tableBookings: array of { tableId: string, seats: number, totalPrice?: number }
  const seatIds = Array.isArray(body.seatIds) ? body.seatIds as string[] : undefined;
  const tableBookings = Array.isArray(body.tableBookings) ? body.tableBookings as Array<{ tableId: string; seats: number; totalPrice?: number }> : undefined;

  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000;

  // Legacy seat-level booking
  if (seatIds && seatIds.length > 0) {
    const locks: Map<string, Promise<void>> = (app as any).__seatLocks || new Map();
    (app as any).__seatLocks = locks;

    const runWithLock = async <T,>(key: string, fn: () => Promise<T>) => {
      const prev = locks.get(key) || Promise.resolve();
      let release: () => void = () => {};
      const next = new Promise<void>((r) => { release = r; });
      locks.set(key, prev.then(() => next));
      try {
        await prev;
        return await fn();
      } finally {
        release();
        if (locks.get(key) === next) locks.delete(key);
      }
    };

    try {
      const result = await runWithLock(eventId, async () => {
        const seatsToReserve: any[] = [];
        for (const seatId of seatIds) {
          const s = inMemorySeats.find((x) => x.id === seatId && x.eventId === eventId);
          if (!s) return { status: 400, body: { error: `Seat not found: ${seatId}` } };
          if (s.status !== 'available') return { status: 400, body: { error: `Seat not available: ${seatId}` } };
          seatsToReserve.push(s);
        }

        const totalPrice = seatsToReserve.reduce((sum, s) => sum + Number(s.price || 0), 0);

        // Reserve seats
        for (const s of seatsToReserve) s.status = 'reserved';

        const booking: import('./state').InMemoryBooking = {
          id: uuid(),
          eventId,
          userId,
          userPhone,
          seatIds,
          totalPrice,
          status: 'reserved',
          createdAt: now,
          expiresAt,
          tableId: '',
          seatsBooked: 0,
        };

        inMemoryBookings.push(booking);
        console.log(JSON.stringify({
          action: 'booking_created',
          bookingId: booking.id,
          eventId: booking.eventId,
          timestamp: new Date().toISOString(),
        }));

        // persist booking to DB for longer-term storage (mirror)
        try {
          addBooking({
            id: booking.id,
            eventId: booking.eventId,
            userTelegramId: Number(userId) || 0,
            username: (req.user && (req.user as any).username) || '',
            userPhone,
            seatIds: booking.seatIds,
            totalAmount: booking.totalPrice,
            status: 'reserved',
            createdAt: booking.createdAt,
          } as any);
        } catch {}

        // Expire reservation after 15 minutes if still reserved
        setTimeout(() => {
          const b = inMemoryBookings.find((x) => x.id === booking.id);
          if (!b) return;
          if (b.status === 'reserved') {
            for (const sid of b.seatIds) {
              const s = inMemorySeats.find((x) => x.id === sid && x.eventId === b.eventId);
              if (s && s.status === 'reserved') s.status = 'available';
            }
            b.status = 'expired';
          }
        }, expiresAt - now);

        const paymentInstructions = event
          ? `Pay ${booking.totalPrice} ₽ to ${event.paymentPhone || 'the provided payment method'}`
          : `Pay ${booking.totalPrice} ₽`;

        return { status: 201, body: { booking, paymentInstructions } };
      });

      return res.status(result.status).json(result.body);
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Table-level booking
  if (tableBookings && tableBookings.length > 0) {
    // validate requested tables
    const updates: { tableId: string; seats: number; totalPrice: number }[] = [];
    let totalPrice = 0;
    for (const tb of tableBookings) {
      const tableId = tb.tableId;
      const seatsRequested = Number(tb.seats) || 0;
      if (!tableId || seatsRequested <= 0) return res.status(400).json({ error: 'Invalid tableBookings entries' });
      const table = event.tables.find((t) => t.id === tableId);
      if (!table) return res.status(400).json({ error: `Table not found: ${tableId}` });
      if (table.seatsAvailable < seatsRequested) return res.status(400).json({ error: `Not enough seats available at table ${table.number}` });
      const tbPrice = Number(tb.totalPrice) || 0;
      updates.push({ tableId, seats: seatsRequested, totalPrice: tbPrice });
      totalPrice += tbPrice;
    }

    // Apply updates atomically
    const events = getEvents();
    const evIdx = events.findIndex((e) => e.id === event.id);
    if (evIdx === -1) return res.status(500).json({ error: 'Event not found in storage' });

    for (const up of updates) {
      const evt = events[evIdx];
      if (!evt || !evt.tables) continue;
      const table = evt.tables.find((t) => t.id === up.tableId);
      if (!table) continue;
      table.seatsAvailable = Math.max(0, table.seatsAvailable - up.seats);
    }

    // persist updated events
    saveEvents(events);

    const singleTable = updates.length === 1 ? updates[0] : null;
    const bookingRecord = {
      id: uuid(),
      eventId: event.id,
      userId,
      userPhone,
      seatIds: [],
      totalPrice,
      status: 'reserved',
      createdAt: now,
      expiresAt,
      tableId: singleTable ? singleTable.tableId : '',
      seatsBooked: singleTable ? singleTable.seats : 0,
      tableBookings: updates,
    } as any;

    inMemoryBookings.push(bookingRecord);
    console.log(JSON.stringify({
      action: 'booking_created',
      bookingId: bookingRecord.id,
      eventId: bookingRecord.eventId,
      timestamp: new Date().toISOString(),
    }));

    // persist to DB (mirror) — include tableBookings in db record if possible
    try {
      addBooking({
        id: bookingRecord.id,
        eventId: bookingRecord.eventId,
        userTelegramId: Number(userId) || 0,
        username: (req.user && (req.user as any).username) || '',
        userPhone,
        seatIds: [],
        totalAmount: bookingRecord.totalPrice,
        status: 'reserved',
        createdAt: bookingRecord.createdAt,
        // store tableBookings under a custom field for compatibility
        tableBookings: bookingRecord.tableBookings,
      } as any);
    } catch {}

    // Expire reservation after 15 minutes if still reserved — restore seatsAvailable
    setTimeout(() => {
      const b = inMemoryBookings.find((x) => x.id === bookingRecord.id);
      if (!b) return;
      if (b.status === 'reserved') {
        // restore seats
        const evs = getEvents();
        const idx = evs.findIndex((e) => e.id === bookingRecord.eventId);
        if (idx !== -1 && evs[idx]?.tables) {
          for (const tb of (b.tableBookings || [])) {
            const table = evs[idx].tables?.find((t) => t.id === tb.tableId);
            if (table) table.seatsAvailable = Math.min(table.seatsTotal, table.seatsAvailable + tb.seats);
          }
          saveEvents(evs);
        }
        b.status = 'expired';
      }
    }, expiresAt - now);

    const paymentInstructions = event
      ? `Pay ${totalPrice} ₽ to ${event.paymentPhone || 'the provided payment method'}`
      : `Pay ${totalPrice} ₽`;

    return res.status(201).json({ booking: bookingRecord, paymentInstructions });
  }

  return res.status(400).json({ error: 'Either seatIds[] or tableBookings[] must be provided' });
});

// ==============================
// MY BOOKINGS
// ==============================
app.get('/bookings/my', (req, res) => {
  const telegramUserId = Number(req.query.telegramUserId);
  if (!telegramUserId) {
    return res.status(400).json({ error: 'telegramUserId is required' });
  }
  const all = getBookings();
  const mine = all.filter((b) => b.userTelegramId === telegramUserId);
  res.json(mine);
});


// Mount admin routes (JWT + adminOnly applied inside router)
app.use('/admin', adminEventsRouter);
app.use('/admin', adminSeatsRouter);
app.use('/admin', adminBookingsRouter);
app.use('/admin', adminPaymentsRouter);
// Public read-only event views and JSON endpoints
app.use('/public', publicEventsRouter);
app.use('/public', publicPaymentsRouter);

// NOTE: seat reservation expiry is handled by the booking expiration job
// which moves reserved seats back to available when bookings expire.

// ==============================
// START SERVER
// ==============================
app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
  startBookingExpirationJob();
});
