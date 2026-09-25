import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bodyParser from 'body-parser';
import type { EventData } from './models';
import { db } from './db';
import { bot, notifyAdminsAboutBooking, notifyUser } from './bot';
import adminEventsRouter from './routes/adminEvents';
import adminUploadLayoutRouter from './routes/admin.uploadLayout';
import adminBookingsRouter from './routes/adminBookings';
import publicEventsRouter from './routes/publicEvents';
import publicPaymentsRouter from './routes/publicPayments';
import robokassaRouter from './routes/robokassa';
import adminPaymentsRouter from './routes/adminPayments';
import adminControllersRouter from './routes/adminControllers';
import adminRolesRouter from './routes/adminRoles';
import adminDetectLayoutRouter from './routes/adminDetectLayout';
import adminVenuesRouter from './routes/adminVenues';
import adminInvitesRouter from './routes/adminInvites';
import controllerRouter from './routes/controllerRoutes';
import debugRouter from './routes/debug-routes';
import vkWebhookRouter from './routes/vkWebhook';
import { notifyAllAdmins } from './services/notificationService';
import { parseEventToUtc } from './utils/formatDate';
import { authMiddleware } from './auth/auth.middleware';
import { adminOnly } from './auth/admin.middleware';
import 'dotenv/config';
import authRoutes from './auth/auth.routes';
import meRoutes from './routes/me.routes';
import { setBookingEventNotifier } from './domain/bookings';
import { setPaymentEventNotifier } from './domain/payments';
import { TelegramBookingNotifier } from './infra/telegram';
import { TelegramPaymentNotifier } from './infra/telegram/telegram.payment-notifier';
import { startBookingExpirationJob } from './infra/scheduler';
import { createPendingBookingFromWebAppPayload } from './webappBooking';
import { supabase } from './supabaseClient';
import { verifyTicketToken } from './services/ticketToken';
import { DEFAULT_TZ_OFFSET_MINUTES } from './config/timezone';


const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());

// CORS before any route — including /health, which the Mini App calls on startup to
// warm up the instance. Registered after the route it would not apply to it, and the
// browser dropped the warmup response.
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

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
    if (supabase) {
      const { error } = await supabase.from('bookings').select('total_amount').limit(1);
      if (error && (error.message.includes('total_amount') || /column.*does not exist/i.test(error.message))) {
        console.error('[Storage] Boot: bookings.total_amount column missing. Run: ALTER TABLE bookings ADD COLUMN total_amount NUMERIC(12,2) NOT NULL DEFAULT 0;');
      }
    }
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

// Health check — used by UptimeRobot to prevent Render.com free-tier sleep.
//
// It also reports which commit is running. Without that there is no way to tell
// from outside whether a deploy has landed: every /admin path answers 401 before
// routing, so probing a new endpoint proves nothing, and nothing else on the
// public surface changes between most releases.
//
// RENDER_GIT_COMMIT is injected by Render; the fallbacks cover other hosts.
const BUILD_COMMIT =
  process.env.RENDER_GIT_COMMIT ||
  process.env.SOURCE_VERSION ||
  process.env.GIT_COMMIT ||
  'unknown';
const STARTED_AT = new Date().toISOString();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    commit: BUILD_COMMIT.slice(0, 7),
    startedAt: STARTED_AT,
  });
});

// JSON body parser for req.body (equivalent to express.json())
app.use(bodyParser.json());

// Robokassa mounts at the root: its callbacks carry full paths and must sit
// before anything that could swallow them. Its own routes do their own auth —
// the callbacks by signature, the payment-link route by token.
app.use(robokassaRouter);

app.use('/auth', authRoutes);
app.use('/me', meRoutes);

/**
 * GET /verify-ticket/:token — verify signed ticket QR (for entry check, bot, etc.)
 */
app.get('/verify-ticket/:token', async (req, res) => {
  const token = req.params.token;
  if (!token) return res.status(400).json({ valid: false });

  const payload = verifyTicketToken(token);
  if (!payload) return res.json({ valid: false });

  try {
    // Scanning a ticket at the door needs one booking and one event, not the
    // whole history of both.
    const booking = await db.getBookingById(payload.bookingId);
    if (!booking) return res.json({ valid: false });

    if (booking.status !== 'paid') return res.json({ valid: false });
    if (booking.isUsed === true) return res.json({ valid: false, is_used: true });

    const ev = await db.findEventById(booking.eventId, true);
    // A paid ticket from a concert months ago stayed green forever: the check
    // only asked "paid and not used yet". It is valid around its own night.
    const startTs = parseEventToUtc(
      (ev as any)?.event_date,
      (ev as any)?.event_time,
      (ev as any)?.timezoneOffsetMinutes ?? DEFAULT_TZ_OFFSET_MINUTES,
    );
    if (startTs != null) {
      const HOURS = 60 * 60 * 1000;
      if (Date.now() < startTs - 12 * HOURS || Date.now() > startTs + 12 * HOURS) {
        return res.json({ valid: false, wrong_date: true, eventTitle: ev?.title ?? '' });
      }
    }
    const tbl = ev?.tables?.find((t: any) => t.id === booking.tableId);
    const tableNumber = tbl?.number ?? payload.tableNumber ?? booking.tableId;
    const seats = booking.seatsBooked ?? payload.seats ?? 0;

    return res.json({
      valid: true,
      eventTitle: ev?.title ?? '',
      tableNumber,
      seats,
      is_used: booking.isUsed ?? false,
    });
  } catch (err) {
    console.error('[verify-ticket]', err);
    return res.status(500).json({ valid: false });
  }
});

/**
 * ==============================
 * TELEGRAM WEBHOOK ENDPOINT
 * ==============================
 * Telegram будет слать POST сюда
 */
app.post('/telegram/webhook', (req, res) => {
  // Telegram signs its calls with a secret we choose and it echoes back in this
  // header. Without the check anyone could post updates here pretending to be
  // any user. Set TELEGRAM_WEBHOOK_SECRET and register the webhook with it.
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    const got = req.header('X-Telegram-Bot-Api-Secret-Token');
    if (got !== expected) {
      console.warn('[telegram/webhook] rejected: bad or missing secret token');
      return res.sendStatus(401);
    }
  } else {
    console.warn('[telegram/webhook] TELEGRAM_WEBHOOK_SECRET is not set — the webhook accepts anyone');
  }
  if (bot) {
    bot.handleUpdate(req.body);
  }
  return res.sendStatus(200);
});

/**
 * POST /telegram/webapp — receive Telegram WebApp booking data (from sendData or bot forwarding).
 * Body: JSON { eventId, tableId, seats: number[], phone } or raw string (JSON).
 * Creates pending booking and returns { ok: true }.
 */
const webappLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
app.post('/telegram/webapp', webappLimiter, async (req, res) => {
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
  const shouldSeed = process.env.SEED_TEST_EVENT === 'true';
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
app.get('/bookings/my', authMiddleware, async (req: any, res) => {
  const telegramUserId = Number(req.query.telegramUserId);
  if (!telegramUserId) {
    return res.status(400).json({ error: 'telegramUserId is required' });
  }
  if (String(telegramUserId) !== String(req.user?.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const all = await db.getBookings();
  const mine = all.filter((b) => b.userTelegramId === telegramUserId);
  res.json(mine);
});


// Mount admin routes (JWT + adminOnly applied inside router)
app.use('/admin', adminEventsRouter);
app.use('/admin', adminUploadLayoutRouter);
app.use('/admin', adminBookingsRouter);
app.use('/admin', adminPaymentsRouter);
app.use('/admin', adminControllersRouter);
app.use('/admin', adminRolesRouter);
app.use('/admin', adminDetectLayoutRouter);
app.use('/admin', adminVenuesRouter);
app.use('/admin', adminInvitesRouter);
app.use('/controller', controllerRouter);
// Public read-only event views and JSON endpoints
app.use('/public', publicEventsRouter);
app.use('/public', publicPaymentsRouter);
app.use('/debug', debugRouter);
app.use('/vk', vkWebhookRouter);

// Temporary test: GET /test-admin-notify — calls notifyAdmins("Test message")
app.get('/test-admin-notify', authMiddleware, adminOnly, async (_req, res) => {
  try {
    await notifyAllAdmins('Test message');
    res.json({ ok: true, message: 'notifyAdmins called' });
  } catch (err) {
    console.error('[test-admin-notify]', err);
    res.status(500).json({ error: String(err) });
  }
});

// NOTE: seat reservation expiry is handled by the booking expiration job
// which moves reserved seats back to available when bookings expire.

// ==============================
// START SERVER
// ==============================
app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
  startBookingExpirationJob();

  // Re-register the webhook with the secret this server checks for. Without
  // this, turning the secret on would make the server reject every real
  // Telegram call until someone called setWebhook by hand.
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const publicUrl = process.env.PUBLIC_API_URL || process.env.API_BASE_URL;
  if (bot && webhookSecret && publicUrl) {
    const url = `${publicUrl.replace(/\/+$/, '')}/telegram/webhook`;
    bot.telegram
      .setWebhook(url, { secret_token: webhookSecret })
      .then(() => console.log('[telegram] webhook registered with a secret:', url))
      .catch((e) => console.error('[telegram] setWebhook failed', e));
  } else if (bot && webhookSecret) {
    console.warn('[telegram] TELEGRAM_WEBHOOK_SECRET is set but PUBLIC_API_URL/API_BASE_URL is not — register the webhook manually');
  }
});
