import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import type { EventData } from './models';
import { db } from './db';
import { bot, notifyAdminsAboutBooking, notifyUser } from './bot';
import adminEventsRouter from './routes/adminEvents';
import adminBookingsRouter from './routes/adminBookings';
import publicEventsRouter from './routes/publicEvents';
import publicPaymentsRouter from './routes/publicPayments';
import adminPaymentsRouter from './routes/adminPayments';
import debugRouter from './routes/debug-routes';
import { authMiddleware } from './auth/auth.middleware';
import 'dotenv/config';
import authRoutes from './auth/auth.routes';
import meRoutes from './routes/me.routes';
import { setBookingEventNotifier } from './domain/bookings';
import { setPaymentEventNotifier } from './domain/payments';
import { TelegramBookingNotifier } from './infra/telegram';
import { TelegramPaymentNotifier } from './infra/telegram/telegram.payment-notifier';
import { startBookingExpirationJob } from './infra/scheduler';
import { createPendingBookingFromWebAppPayload } from './webappBooking';


const app = express();
const PORT = process.env.PORT || 4000;

console.log('[ENV CHECK] SUPABASE_URL:', process.env.SUPABASE_URL);

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

// Storage state on boot — warn if empty (ephemeral disk loses data on restart/redeploy)
void (async () => {
  try {
    const events = await db.getEvents();
    const bookings = await db.getBookings();
    if (events.length === 0 && bookings.length === 0) {
      console.warn('[Storage] Boot: storage is empty (no events, no bookings).');
    } else {
      console.log('[Storage] Boot: events=%d, bookings=%d', events.length, bookings.length);
    }
  } catch (e) {
    console.error('[Storage] Boot: failed to read storage', e);
  }
})();

// CORS before any routes — required for Telegram WebApp cross-origin POST (e.g. /public/bookings)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// JSON body parser for req.body (equivalent to express.json())
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

/**
 * POST /telegram/webapp — receive Telegram WebApp booking data (from sendData or bot forwarding).
 * Body: JSON { eventId, tableId, seats: number[], phone } or raw string (JSON).
 * Creates pending booking and returns { ok: true }.
 */
app.post('/telegram/webapp', async (req, res) => {
  try {
    let payload: { eventId?: string; tableId?: string; seats?: number[]; phone?: string };
    if (typeof req.body === 'string') {
      payload = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      payload = req.body;
    } else {
      res.status(400).json({ error: 'Invalid body' });
      return;
    }
    await createPendingBookingFromWebAppPayload({
      eventId: String(payload.eventId ?? ''),
      tableId: String(payload.tableId ?? ''),
      seats: Array.isArray(payload.seats) ? payload.seats : [],
      phone: typeof payload.phone === 'string' ? payload.phone : '',
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[telegram/webapp]', e);
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'Table is not available for sale') {
      res.status(403).json({ error: 'Table is not available for sale' });
      return;
    }
    res.status(500).json({ error: 'internal' });
  }
});

// Seed a single published event for dev/preview or explicit flag.
const seedTestEvent = async () => {
  const shouldSeed = process.env.SEED_TEST_EVENT === 'true' || process.env.NODE_ENV !== 'production';
  if (!shouldSeed) return;

  const seedId = 'seed-public-event';
  const existing = await db.findEventById(seedId);
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

  await db.upsertEvent(base);
  await db.upsertEvent({ ...base, status: 'published', published: true });
};

void seedTestEvent();

// ==============================
// EVENTS
// ==============================
app.get('/events', async (_req, res) => {
  const events = (await db.getEvents())
    .filter((e: any) => e?.published === true || e?.status === 'published')
    .map((e: any) => ({
      ...e,
      tables: Array.isArray(e?.tables) ? e.tables : [],
    }));
  res.json(events);
});

app.get('/events/:eventId', async (req, res) => {
  const event = await db.findEventById(req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if ((event as any).published !== true && (event as any).status !== 'published') {
    return res.status(404).json({ error: 'Event not found' });
  }
  const safeEvent = {
    ...event,
    tables: Array.isArray((event as any)?.tables) ? (event as any).tables : [],
  };
  res.json(safeEvent);
});

// ==============================
// MY BOOKINGS
// ==============================
app.get('/bookings/my', async (req, res) => {
  const telegramUserId = Number(req.query.telegramUserId);
  if (!telegramUserId) {
    return res.status(400).json({ error: 'telegramUserId is required' });
  }
  const all = await db.getBookings();
  const mine = all.filter((b) => b.userTelegramId === telegramUserId);
  res.json(mine);
});


// Mount admin routes (JWT + adminOnly applied inside router)
app.use('/admin', adminEventsRouter);
app.use('/admin', adminBookingsRouter);
app.use('/admin', adminPaymentsRouter);
// Public read-only event views and JSON endpoints
app.use('/public', publicEventsRouter);
app.use('/public', publicPaymentsRouter);
app.use('/debug', debugRouter);

// NOTE: seat reservation expiry is handled by the booking expiration job
// which moves reserved seats back to available when bookings expire.

// ==============================
// START SERVER
// ==============================
app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
  startBookingExpirationJob();
});
