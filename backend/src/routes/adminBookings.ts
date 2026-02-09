import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';
import { inMemoryBookings } from '../state';
import { seats as inMemorySeats } from './adminSeats';
import { getBookings, saveBookings, getEvents } from '../db';
import { notifyUser } from '../bot';
import type { Ticket } from '../models';

const router = Router();

router.use(authMiddleware, adminOnly);

// GET /admin/bookings
router.get('/bookings', (_req: Request, res: Response) => {
  const bookings = getBookings();
  const events = getEvents();

  const result = bookings.map((b) => {
    const ev = events.find((e) => e.id === b.eventId);
    return {
      id: b.id,
      event: ev ? { id: ev.id, title: ev.title, date: ev.date } : { id: b.eventId, title: '', date: '' },
      seatIds: Array.isArray(b.seatIds) ? b.seatIds : [],
      tableBookings: Array.isArray(b.tableBookings) ? b.tableBookings : [],
      userTelegramId: b.userTelegramId,
      userPhone: b.userPhone,
      totalAmount: b.totalAmount,
      status: b.status,
      expiresAt: b.expiresAt,
    };
  });

  res.json(result);
});

// POST /admin/bookings/:id/confirm
router.post('/bookings/:id/confirm', async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const booking = inMemoryBookings.find((b) => b.id === id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status !== 'reserved') return res.status(400).json({ error: 'Only reserved bookings can be confirmed' });
  const now = Date.now();
  if (now > booking.expiresAt) return res.status(400).json({ error: 'Booking expired' });

  const tickets: Ticket[] = [];
  if (Array.isArray(booking.seatIds) && booking.seatIds.length > 0) {
    for (const seatId of booking.seatIds) {
      tickets.push({
        id: uuid(),
        bookingId: booking.id,
        eventId: booking.eventId,
        seatId,
        createdAt: now,
      });
    }
  } else if (Array.isArray(booking.tableBookings) && booking.tableBookings.length > 0) {
    for (const tb of booking.tableBookings) {
      const seats = Number(tb.seats) || 0;
      for (let i = 0; i < seats; i += 1) {
        tickets.push({
          id: uuid(),
          bookingId: booking.id,
          eventId: booking.eventId,
          tableId: tb.tableId,
          createdAt: now,
        });
      }
    }
  } else if (booking.tableId && typeof booking.seatsBooked === 'number') {
    for (let i = 0; i < booking.seatsBooked; i += 1) {
      tickets.push({
        id: uuid(),
        bookingId: booking.id,
        eventId: booking.eventId,
        tableId: booking.tableId,
        createdAt: now,
      });
    }
  }
  console.log(JSON.stringify({
    action: 'tickets_generated',
    bookingId: booking.id,
    eventId: booking.eventId,
    timestamp: new Date().toISOString(),
    ticketsCount: tickets.length,
  }));

  // mark booking paid and attach tickets
  booking.status = 'paid';
  booking.tickets = tickets;
  console.log(JSON.stringify({
    action: 'payment_confirmed',
    bookingId: booking.id,
    eventId: booking.eventId,
    timestamp: new Date().toISOString(),
  }));

  // If booking contains seatIds, mark seats sold (legacy)
  if (Array.isArray(booking.seatIds) && booking.seatIds.length > 0) {
    for (const sid of booking.seatIds) {
      const s = inMemorySeats.find((x) => x.id === sid && x.eventId === booking.eventId);
      if (s) s.status = 'sold';
    }
  }

  let persistedBooking: { userTelegramId?: number } | undefined;
  // mirror status and tickets to persisted DB if present
  try {
    const dbBookings = getBookings();
    const dbBooking = dbBookings.find((b) => b.id === booking.id);
    if (dbBooking) {
      dbBooking.status = 'paid';
      dbBooking.tickets = tickets;
      saveBookings(dbBookings);
      persistedBooking = dbBooking;
    }
  } catch {}

  // notify user via Telegram (best-effort)
  const userChatId = typeof persistedBooking?.userTelegramId === 'number'
    ? persistedBooking.userTelegramId
    : Number(booking.userId);
  if (Number.isFinite(userChatId) && userChatId > 0) {
    await notifyUser(userChatId, `Ваше бронирование ${booking.id} подтверждено. Оплата зафиксирована, билеты сформированы.`);
  }

  res.json({ ok: true, booking, tickets });
});

export default router;
