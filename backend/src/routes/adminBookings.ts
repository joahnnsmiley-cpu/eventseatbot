import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';
import { db } from '../db';
import { supabase } from '../supabaseClient';
import { sendTelegramMessage, sendTelegramPhoto } from '../services/telegramService';
import { generateTicket } from '../services/ticketGenerator';
import type { Ticket } from '../models';
import type { Booking } from '../models';

const router = Router();

router.use(authMiddleware, adminOnly);

/** Fire-and-forget: generate ticket PNG, save URL, send to user. Does not block confirm. */
async function generateAndSendTicket(booking: Booking): Promise<void> {
  try {
    const ev = (await db.findEventById(booking.eventId)) as { imageUrl?: string; event_date?: string; event_time?: string; title?: string; tables?: { id: string; number: number }[] } | null;
    const tbl = ev?.tables?.find((t) => t.id === booking.tableId);
    const tableNumber = tbl?.number ?? booking.tableId ?? '—';
    const seats = booking.seatsBooked ?? booking.tableBookings?.[0]?.seats ?? 0;

    const ticketUrl = await generateTicket({
      templateUrl: (ev as any)?.ticketTemplateUrl ?? ev?.imageUrl ?? '',
      bookingId: booking.id,
      eventId: booking.eventId,
      eventTitle: ev?.title ?? '',
      eventDate: [ev?.event_date, ev?.event_time].filter(Boolean).join(' ') || '',
      tableNumber,
      seats,
    });

    if (ticketUrl) {
      await db.updateBookingTicketFileUrl(booking.id, ticketUrl);

      const userChatId = typeof booking.userTelegramId === 'number' ? booking.userTelegramId : 0;
      if (Number.isFinite(userChatId) && userChatId > 0) {
        await sendTelegramPhoto(userChatId, ticketUrl, '🎟 Ваш билет');
      }
    } else {
      const userChatId = typeof booking.userTelegramId === 'number' ? booking.userTelegramId : 0;
      if (Number.isFinite(userChatId) && userChatId > 0) {
        await sendTelegramMessage(userChatId, '✅ Оплата подтверждена\n\nЖдём вас на мероприятии!');
      }
    }
  } catch (err) {
    console.error('[generateAndSendTicket]', err);
    const userChatId = typeof booking.userTelegramId === 'number' ? booking.userTelegramId : 0;
    if (Number.isFinite(userChatId) && userChatId > 0) {
      sendTelegramMessage(userChatId, '✅ Оплата подтверждена\n\nЖдём вас на мероприятии!').catch(() => {});
    }
  }
}

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
    const createdAt = typeof b.createdAt === 'number' ? new Date(b.createdAt).toISOString() : (b.createdAt as string) ?? '';
    const expiresAt = b.expiresAt != null
      ? (typeof b.expiresAt === 'number' ? new Date(b.expiresAt).toISOString() : String(b.expiresAt))
      : null;
    return {
      id: b.id,
      event_id: b.eventId,
      table_id: b.tableId ?? null,
      seat_indices: Array.isArray(b.seatIndices) ? b.seatIndices : [],
      seats_booked: b.seatsBooked ?? 0,
      user_telegram_id: b.userTelegramId ?? null,
      user_phone: b.userPhone ?? '',
      status: b.status,
      created_at: createdAt,
      expires_at: expiresAt,
      event: ev ? { id: ev.id, title: ev.title, date: ev.date } : { id: b.eventId, title: '', date: '' },
      seatIds: Array.isArray(b.seatIds) ? b.seatIds : [],
      tableBookings: Array.isArray(b.tableBookings) && b.tableBookings.length > 0
        ? b.tableBookings
        : b.tableId != null && typeof b.seatsBooked === 'number'
          ? [{ tableId: b.tableId, seats: b.seatsBooked }]
          : [],
      userTelegramId: b.userTelegramId,
      userPhone: b.userPhone,
      user_comment: b.userComment ?? null,
      totalAmount: b.totalAmount,
      expiresAt: b.expiresAt,
      ticket_file_url: (b as any).ticketFileUrl ?? null,
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

  // Fire-and-forget: notify user on paid/cancelled; for paid also generate and send ticket
  const userChatId = typeof updated.userTelegramId === 'number' ? updated.userTelegramId : 0;
  if (Number.isFinite(userChatId) && userChatId > 0) {
    if (status === 'paid') {
      generateAndSendTicket(updated).catch((err) => console.error('Telegram/ticket:', err));
    } else if (status === 'cancelled') {
      sendTelegramMessage(userChatId, '❌ Бронь отменена\n\nСвяжитесь с организатором при необходимости.').catch((err) => console.error('Telegram user:', err));
    }
  }

  return res.json(updated);
});

// PATCH /admin/bookings/:id/confirm — set status to paid (simple, no tickets)
router.patch('/bookings/:id/confirm', async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) return res.status(400).json({ error: 'Booking id is required' });
  if (!supabase) return res.status(503).json({ error: 'Storage not configured' });

  try {
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status === 'paid') {
      return res.json(booking);
    }

    const { data: updated, error: updateErr } = await supabase
      .from('bookings')
      .update({ status: 'paid' })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('[PATCH confirm]', updateErr);
      return res.status(500).json({ error: updateErr.message });
    }

    // Fire-and-forget: generate ticket and notify user
    const bookingForTicket: Booking = {
      id: updated.id,
      eventId: updated.event_id,
      tableId: updated.table_id ?? undefined,
      userTelegramId: Number(updated.user_telegram_id ?? 0),
      username: '',
      userPhone: updated.user_phone ?? '',
      seatIds: [],
      totalAmount: Number(updated.total_amount) || 0,
      status: 'paid',
      createdAt: Date.now(),
    };
    if (updated.seats_booked != null) bookingForTicket.seatsBooked = updated.seats_booked;
    if (updated.table_id && updated.seats_booked != null) {
      bookingForTicket.tableBookings = [{ tableId: updated.table_id, seats: updated.seats_booked }];
    }
    const userChatId = Number(updated?.user_telegram_id ?? 0);
    if (Number.isFinite(userChatId) && userChatId > 0) {
      generateAndSendTicket(bookingForTicket).catch((err) => console.error('Telegram/ticket:', err));
    }

    return res.json(updated);
  } catch (err) {
    console.error('[PATCH confirm]', err);
    return res.status(500).json({ error: String(err) });
  }
});

// PATCH /admin/bookings/:id/cancel — cancel reserved/awaiting_confirmation, restore seats
router.patch('/bookings/:id/cancel', async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) return res.status(400).json({ error: 'Booking id is required' });
  if (!supabase) return res.status(503).json({ error: 'Storage not configured' });

  try {
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const status = String(booking.status ?? '');
    if (status === 'reserved' || status === 'awaiting_confirmation') {
      // seats_available is computed from bookings on read; no need to update event_tables

      const { data: updated, error: updateErr } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select()
        .single();

      if (updateErr) {
        console.error('[PATCH cancel]', updateErr);
        return res.status(500).json({ error: updateErr.message });
      }

      // Fire-and-forget: notify user
      const userChatId = Number(updated?.user_telegram_id ?? 0);
      if (Number.isFinite(userChatId) && userChatId > 0) {
        sendTelegramMessage(userChatId, '❌ Бронь отменена\n\nСвяжитесь с организатором при необходимости.').catch((err) => console.error('Telegram user:', err));
      }

      return res.json(updated);
    }

    return res.json(booking);
  } catch (err) {
    console.error('[PATCH cancel]', err);
    return res.status(500).json({ error: String(err) });
  }
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
    generateAndSendTicket(updated).catch((err) => console.error('Telegram/ticket:', err));
  }

  res.json({ ok: true, booking: { ...updated, tickets }, tickets });
});

export default router;
