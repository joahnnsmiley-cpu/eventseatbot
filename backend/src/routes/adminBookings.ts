import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOrOrganizer } from '../auth/admin.middleware';
import { db } from '../db';
import { supabase } from '../supabaseClient';
import { sendTelegramMessage } from '../services/telegramService';
import { sendVkMessage } from '../services/vkService';
import {
  confirmBookingPaid,
  deliverTicket as generateAndSendTicket,
} from '../domain/bookings/confirmPayment';
import type { Booking } from '../models';

const router = Router();

router.use(authMiddleware, adminOrOrganizer);

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
  let bookings: Awaited<ReturnType<typeof db.getBookings>>;
  let events: Awaited<ReturnType<typeof db.getEvents>>;
  try {
    bookings = await db.getBookings();
    events = await db.getEvents();
  } catch (e) {
    console.error('[GET /admin/bookings] DB error:', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }

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
    pending: ['awaiting_confirmation', 'cancelled'],
    reserved: ['awaiting_confirmation', 'cancelled'],
    awaiting_payment: ['awaiting_confirmation', 'cancelled'],
    awaiting_confirmation: ['paid', 'cancelled'],
    payment_submitted: ['paid', 'cancelled'],
    // Admin can confirm or cancel expired bookings (user may have transferred money without tapping "I paid")
    expired: ['paid', 'cancelled'],
  };
  const allowedTargets = validTransitions[current];
  if (!allowedTargets || !allowedTargets.includes(status)) {
    return res.status(409).json({ error: `Invalid transition: ${current} → ${status}` });
  }

  const updated = await db.updateBookingStatus(id, status);
  if (!updated) return res.status(500).json({ error: 'Failed to update booking status' });

  // Fire-and-forget: notify user on paid/cancelled; for paid also generate and send ticket
  if (status === 'paid') {
    console.log(`[ADMIN] Confirming paid booking ${id} on platform ${updated.platform}`);
    generateAndSendTicket(updated).catch((err) => console.error('Ticket delivery error:', err));
  } else if (status === 'cancelled') {
    if (updated.platform === 'vk' && updated.user_vk_id) {
      sendVkMessage(updated.user_vk_id, '❌ Бронь отменена\n\nСвяжитесь с организатором при необходимости.').catch(() => { });
    } else if (updated.userTelegramId) {
      sendTelegramMessage(updated.userTelegramId, '❌ Бронь отменена\n\nСвяжитесь с организатором при необходимости.').catch(() => { });
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
      platform: updated.platform, // CRITICAL: Added platform
      user_vk_id: updated.user_vk_id, // CRITICAL: Added user_vk_id
    };
    if (Array.isArray(updated.seat_indices)) bookingForTicket.seatIndices = updated.seat_indices;
    if (updated.seats_booked != null) bookingForTicket.seatsBooked = updated.seats_booked;
    if (updated.table_id && updated.seats_booked != null) {
      bookingForTicket.tableBookings = [{ tableId: updated.table_id, seats: updated.seats_booked }];
    }

    console.log(`[ADMIN] Simple confirm for booking ${id} on platform ${updated.platform}`);
    generateAndSendTicket(bookingForTicket).catch((err) => console.error('Ticket delivery error:', err));

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

  // No expiry check: an admin confirming is explicitly overriding it, for the
  // guest who transferred the money but never pressed "I paid".
  const result = await confirmBookingPaid(id, 'admin');
  if (!result.ok) return res.status(result.status).json({ error: result.error });

  res.json({
    ok: true,
    booking: { ...result.booking, tickets: result.tickets },
    tickets: result.tickets,
    alreadyPaid: result.alreadyPaid,
  });
});

export default router;
