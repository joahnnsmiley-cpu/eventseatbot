import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';
import { db } from '../db';
import { notifyUser } from '../bot';
import type { Ticket } from '../models';

const router = Router();

router.use(authMiddleware, adminOnly);

// GET /admin/debug-bookings
router.get('/debug-bookings', async (req, res) => {
  const bookings = await db.getBookings();
  return res.json({
    count: bookings.length,
    bookings
  });
});

// GET /admin/raw-bookings
router.get('/raw-bookings', async (req, res) => {
  const bookings = await db.getBookings();
  return res.json({
    count: bookings.length,
    data: bookings
  });
});

// GET /admin/bookings
router.get('/bookings', async (_req: Request, res: Response) => {
  const bookings = await db.getBookings();
  const events = await db.getEvents();

  const result = bookings.map((b) => {
    const ev = events.find((e) => e.id === b.eventId);
    return {
      id: b.id,
      event: ev ? { id: ev.id, title: ev.title, date: ev.date } : { id: b.eventId, title: '', date: '' },
      seatIds: Array.isArray(b.seatIds) ? b.seatIds : [],
      tableBookings: Array.isArray(b.tableBookings) && b.tableBookings.length > 0
        ? b.tableBookings
        : b.tableId != null && typeof b.seatsBooked === 'number'
          ? [{ tableId: b.tableId, seats: b.seatsBooked }]
          : [],
      userTelegramId: b.userTelegramId,
      userPhone: b.userPhone,
      totalAmount: b.totalAmount,
      status: b.status,
      expiresAt: b.expiresAt,
    };
  });

  res.json(result);
});

// PATCH /admin/bookings/:id/status
// Allowed transitions: pending→awaiting_confirmation, awaiting_confirmation→paid, awaiting_confirmation→cancelled
router.patch('/bookings/:id/status', async (req: Request, res: Response) => {
  const idParam = req.params.id;

  if (!idParam || Array.isArray(idParam)) {
    return res.status(400).json({ error: 'Invalid booking id' });
  }

  const id = idParam;

  const statusRaw = req.body?.status;

  if (
    statusRaw !== 'paid' &&
    statusRaw !== 'awaiting_confirmation' &&
    statusRaw !== 'cancelled'
  ) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const status = statusRaw as
    | 'paid'
    | 'awaiting_confirmation'
    | 'cancelled';

  const bookings = await db.getBookings();
  const booking = bookings.find((b: any) => b.id === id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const current = String(booking.status);
  const validTransitions: Record<string, string[]> = {
    pending: ['awaiting_confirmation'],
    awaiting_confirmation: ['paid', 'cancelled'],
  };
  const allowedTargets = validTransitions[current];
  if (!allowedTargets || !allowedTargets.includes(status)) {
    return res.status(409).json({ error: `Invalid transition: ${current} → ${status}` });
  }

  const updated = await db.updateBookingStatus(id, status);
  if (!updated) return res.status(500).json({ error: 'Failed to update booking status' });
  return res.json(updated);
});

// POST /admin/bookings/:id/confirm
router.post('/bookings/:id/confirm', async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) return res.status(400).json({ error: 'Booking id is required' });

  const bookings = await db.getBookings();
  const booking = bookings.find((b) => b.id === id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status !== 'reserved') return res.status(400).json({ error: 'Only reserved bookings can be confirmed' });
  const now = Date.now();
  const expiresAtMs = typeof booking.expiresAt === 'number'
    ? booking.expiresAt
    : booking.expiresAt ? new Date(booking.expiresAt).getTime() : 0;
  if (now > expiresAtMs) {
    return res.status(400).json({ error: 'Booking expired' });
  }

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

  const updated = await db.updateBookingStatus(id, 'paid');
  if (!updated) return res.status(500).json({ error: 'Failed to update booking status' });

  await db.updateBookingTickets(id, tickets);

  console.log(JSON.stringify({
    action: 'payment_confirmed',
    bookingId: booking.id,
    eventId: booking.eventId,
    timestamp: new Date().toISOString(),
  }));

  const userChatId = typeof updated.userTelegramId === 'number' ? updated.userTelegramId : 0;
  if (Number.isFinite(userChatId) && userChatId > 0) {
    await notifyUser(userChatId, `Ваше бронирование ${booking.id} подтверждено. Оплата зафиксирована, билеты сформированы.`);
  }

  res.json({ ok: true, booking: { ...updated, tickets }, tickets });
});

export default router;
