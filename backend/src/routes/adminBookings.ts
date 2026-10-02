import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOrOrganizer, scopeOf, mayTouchEvent } from '../auth/admin.middleware';
import type { AuthRequest } from '../auth/auth.middleware';
import { db } from '../db';
import { supabase } from '../supabaseClient';
import { sendTelegramMessage } from '../services/telegramService';
import { sendVkMessage } from '../services/vkService';
import {
  confirmBookingPaid,
  deliverTicket as generateAndSendTicket,
} from '../domain/bookings/confirmPayment';
import type { Booking } from '../models';
import { getProductionCredentials, getRefundPassword } from '../config/robokassa';
import { fetchOpState } from '../domain/payments/opState';
import { requestRefund } from '../domain/payments/refund';
import {
  findPaymentForBooking,
  recordOpState,
  recordRefundRequest,
} from '../domain/payments/robokassa.repository';

const router = Router();

router.use(authMiddleware, adminOrOrganizer);

/**
 * Оставить только те брони, которые этому человеку положено видеть.
 *
 * adminOrOrganizer отвечает лишь на вопрос «пускать ли сюда вообще». Дальше
 * ручки отдавали всё подряд, и организатор одного концерта видел брони и
 * телефоны гостей всех остальных.
 */
async function visibleBookings<T extends { eventId?: string | null }>(
  req: Request,
  bookings: T[],
): Promise<T[]> {
  const scope = await scopeOf(req as AuthRequest);
  if (scope.isAdmin) return bookings;
  return bookings.filter((b) => mayTouchEvent(scope, b.eventId ?? null));
}

/**
 * Не дать тронуть чужую бронь.
 *
 * Без этого организатор мог подтвердить оплату чужого концерта — то есть
 * выдать билет даром, — или отменить чужую оплаченную бронь.
 */
async function guardBooking(req: Request, res: Response): Promise<boolean> {
  const id = String(req.params.id ?? '');
  const booking = id ? await db.getBookingById(id) : null;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return false;
  }
  const scope = await scopeOf(req as AuthRequest);
  if (!mayTouchEvent(scope, booking.eventId)) {
    console.warn(JSON.stringify({
      action: 'admin_booking_out_of_scope',
      userId: String((req as AuthRequest).user?.id ?? ''),
      bookingId: id, eventId: booking.eventId,
    }));
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// Все действия над конкретной бронью проходят проверку принадлежности события.
router.use('/bookings/:id', async (req: Request, res: Response, next) => {
  if (await guardBooking(req, res)) next();
});

// GET /admin/debug-bookings
router.get('/debug-bookings', async (req, res) => {
  const bookings = await visibleBookings(req, await db.getBookings());
  return res.json({
    count: bookings.length,
    bookings
  });
});

// GET /admin/raw-bookings
router.get('/raw-bookings', async (req, res) => {
  const bookings = await visibleBookings(req, await db.getBookings());
  return res.json({
    count: bookings.length,
    data: bookings
  });
});

// GET /admin/bookings
router.get('/bookings', async (req: Request, res: Response) => {
  let bookings: Awaited<ReturnType<typeof db.getBookings>>;
  let events: Awaited<ReturnType<typeof db.getEvents>>;
  try {
    bookings = await visibleBookings(req, await db.getBookings());
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


/**
 * POST /admin/bookings/:id/refund — вернуть деньги за бронь.
 *
 * Зачем это здесь, хотя вернуть можно и в кабинете Робокассы: возврат из
 * кабинета наша система не видит. Проверено на настоящем возврате — состояние
 * операции остаётся «оплата прошла», уведомления о возврате у Робокассы нет.
 * Значит билет у человека продолжает работать. Когда заявку подаём мы, мы
 * знаем её номер и узнаём, чем дело кончилось.
 *
 * Бронь гасится не здесь. Возврат у Робокассы не мгновенный: сначала заявка,
 * потом исполнение. Погасить бронь сразу означало бы отнять билет у человека,
 * которому деньги могут и не вернуться. Поэтому здесь только подаём заявку, а
 * гасит её отдельная задача, когда Робокасса ответит «finished».
 *
 * Принадлежность брони уже проверена заслонкой на /bookings/:id — организатор
 * чужого концерта сюда не дойдёт.
 */
router.post('/bookings/:id/refund', async (req: Request, res: Response) => {
  const id = String(req.params.id ?? '');
  if (!id) return res.status(400).json({ error: 'Booking id is required' });

  const password3 = getRefundPassword();
  if (!password3) {
    return res.status(503).json({ error: 'Возврат не настроен: нет Пароля #3' });
  }

  const booking = await db.getBookingById(id);
  if (!booking) return res.status(404).json({ error: 'Бронь не найдена' });

  const payment = await findPaymentForBooking(id);
  if (!payment) return res.status(404).json({ error: 'По этой брони нет платежа' });
  if (payment.isTest) return res.status(409).json({ error: 'Это тестовый платёж, возвращать нечего' });
  if (payment.status !== 'paid') {
    return res.status(409).json({ error: `Платёж в статусе «${payment.status}», возврат невозможен` });
  }
  if (payment.refundRequestId) {
    return res.status(409).json({
      error: 'Возврат по этому платежу уже запрошен',
      refundState: payment.refundState,
    });
  }

  // OpKey в уведомлении об оплате не приходит — если его ещё не забрала сверка,
  // забираем сейчас, иначе возврат запросить нечем.
  let opKey = payment.opKey;
  if (!opKey) {
    const creds = getProductionCredentials();
    if (!creds) return res.status(503).json({ error: 'Нет боевых реквизитов Робокассы' });
    const state = await fetchOpState(creds, payment.invId);
    if (state?.opKey) {
      opKey = state.opKey;
      await recordOpState(payment.invId, state).catch(() => {});
    }
  }
  if (!opKey) {
    return res.status(502).json({ error: 'Робокасса не отдала идентификатор операции, попробуйте позже' });
  }

  const result = await requestRefund(password3, opKey);
  if (!result.ok) {
    console.error(JSON.stringify({
      action: 'robokassa_refund_failed', bookingId: id, invId: payment.invId, reason: result.error,
    }));
    return res.status(502).json({ error: `Робокасса отказала: ${result.error}` });
  }

  const who = String((req as AuthRequest).user?.id ?? 'неизвестно');
  const claimed = await recordRefundRequest(payment.invId, result.requestId, who);
  if (!claimed) {
    // Кто-то нажал одновременно. Заявка подана, но записана не нами — это не
    // ошибка для нажавшего, просто сообщаем честно.
    return res.status(409).json({ error: 'Возврат уже запрошен' });
  }

  console.log(JSON.stringify({
    action: 'robokassa_refund_requested',
    bookingId: id, invId: payment.invId, requestId: result.requestId, by: who,
    timestamp: new Date().toISOString(),
  }));

  return res.json({
    ok: true,
    requestId: result.requestId,
    message: 'Заявка на возврат подана. Бронь погасится, когда Робокасса вернёт деньги.',
  });
});

export default router;
