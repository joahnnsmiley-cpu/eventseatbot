import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../auth/auth.middleware';
import { db } from '../db';
import { getPremiumUserInfo } from '../config/premium';

const router = Router();

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

export default router;
