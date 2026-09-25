/**
 * Robokassa: starting a payment, and the three URLs Robokassa calls back.
 *
 *   POST /public/payments/robokassa  the guest asks for a payment link
 *   *    /robokassa/result           server-to-server notification — the truth
 *   *    /robokassa/success          where the guest's browser lands
 *   *    /robokassa/fail             where it lands after a failure
 *
 * Only ResultURL may change a booking. SuccessURL is a page the guest could
 * reach by typing the address, so it shows a result and nothing more.
 */

import { Router, Request, Response } from 'express';
import express from 'express';
import { db } from '../db';
import { getRobokassaConfig, ROBOKASSA_IPS } from '../config/robokassa';
import {
  buildPaymentLink,
  verifyResult,
  verifySuccess,
  resultAck,
  formatSum,
  type CallbackParams,
  type ReceiptItem,
} from '../domain/payments/robokassa';
import {
  createPayment,
  findPendingPaymentForBooking,
  findPaymentByInvId,
  markPaymentPaid,
} from '../domain/payments/robokassa.repository';
import { confirmBookingPaid } from '../domain/bookings/confirmPayment';
import { requireUser, ownsBooking } from '../auth/user.middleware';
import type { AuthRequest } from '../auth/auth.middleware';
import { sendTelegramMessage } from '../services/telegramService';

const router = Router();

// Robokassa posts form-encoded bodies; the app's global parser only reads JSON.
router.use(express.urlencoded({ extended: false }));

const TELEGRAM_APP_URL = process.env.ROBOKASSA_RETURN_TELEGRAM || 'https://t.me/nikto_ne_kruche_bot';
const VK_APP_URL = process.env.ROBOKASSA_RETURN_VK || 'https://vk.ru/app54480403';

/** Robokassa may use GET or POST depending on the shop's settings. */
function params(req: Request): CallbackParams {
  return { ...(req.query as CallbackParams), ...(req.body as CallbackParams) };
}

/**
 * Advisory only. Getting the client address right behind Render's proxy is
 * fiddly, and a wrong guess here would reject real payments — while the
 * signature check with password #2 is what actually keeps strangers out. So a
 * stranger's address is logged loudly and the signature decides.
 */
function noteSourceIp(req: Request): void {
  const cfg = getRobokassaConfig();
  const allowed = [...ROBOKASSA_IPS, ...cfg.extraAllowedIps];
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  const ip = forwarded || req.socket.remoteAddress || '';
  const bare = ip.replace(/^::ffff:/, '');
  if (bare && !allowed.includes(bare)) {
    console.warn(JSON.stringify({ action: 'robokassa_unexpected_ip', ip: bare }));
  }
}

function resultPage(title: string, text: string, tone: 'ok' | 'bad'): string {
  const accent = tone === 'ok' ? '#C6A75E' : '#8A8377';
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100dvh; display:flex; align-items:center; justify-content:center;
         background:#0B0A09; color:#F5F1E9; font-family:-apple-system,'Segoe UI',system-ui,sans-serif; }
  main { max-width:22rem; padding:0 1rem; text-align:center; }
  h1 { font-size:1.25rem; margin:0 0 .5rem; color:${accent}; }
  p { margin:0 0 1.5rem; color:rgba(245,241,233,.7); line-height:1.5; font-size:.95rem; }
  a { display:block; margin:.5rem 0; padding:.85rem 1rem; border-radius:1rem; text-decoration:none;
      background:#C6A75E; color:#14110B; font-weight:600; }
  a.secondary { background:transparent; border:1px solid rgba(245,241,233,.2); color:#F5F1E9; }
</style></head>
<body><main>
  <h1>${title}</h1>
  <p>${text}</p>
  <a href="${TELEGRAM_APP_URL}">Вернуться в Telegram</a>
  <a class="secondary" href="${VK_APP_URL}">Вернуться во ВКонтакте</a>
</main></body></html>`;
}

/** The line that ends up on the guest's НПД receipt. */
function receiptFor(eventTitle: string, seats: number, amount: number, tax: string): ReceiptItem[] {
  const word = seats === 1 ? 'место' : seats < 5 ? 'места' : 'мест';
  return [{
    name: `Участие в мероприятии «${eventTitle}», ${seats} ${word}`,
    quantity: 1,
    sum: amount,
    tax,
  }];
}

function seatCount(booking: {
  seatIndices?: number[];
  seatIds?: string[];
  seatsBooked?: number;
  tableBookings?: { seats: number }[];
}): number {
  if (Array.isArray(booking.seatIndices) && booking.seatIndices.length) return booking.seatIndices.length;
  if (Array.isArray(booking.seatIds) && booking.seatIds.length) return booking.seatIds.length;
  if (typeof booking.seatsBooked === 'number' && booking.seatsBooked > 0) return booking.seatsBooked;
  const fromTables = (booking.tableBookings ?? []).reduce((n, t) => n + (Number(t.seats) || 0), 0);
  return fromTables || 1;
}

/**
 * POST /public/payments/robokassa  { bookingId }
 * Returns the link the guest opens. Identity comes from the token, never the body.
 */
router.post('/public/payments/robokassa', requireUser, async (req: AuthRequest, res: Response) => {
  const cfg = getRobokassaConfig();
  if (!cfg.enabled) {
    return res.status(503).json({ error: 'Оплата картой временно недоступна' });
  }

  const bookingId = String((req.body as { bookingId?: string })?.bookingId ?? '').trim();
  if (!bookingId) return res.status(400).json({ error: 'bookingId is required' });

  const booking = await db.getBookingById(bookingId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!ownsBooking(req, booking)) return res.status(403).json({ error: 'Forbidden' });

  if (booking.status === 'paid') {
    return res.status(409).json({ error: 'Бронь уже оплачена' });
  }
  const payable = ['reserved', 'pending', 'awaiting_confirmation', 'payment_submitted'];
  if (!payable.includes(String(booking.status))) {
    return res.status(409).json({ error: `Бронь нельзя оплатить в статусе ${booking.status}` });
  }

  const amount = Number(booking.totalAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(409).json({ error: 'У брони нет суммы к оплате' });
  }

  try {
    // Reopening the payment screen must reuse the same InvId: a second row
    // would mean two live payments for one set of seats.
    const existing = await findPendingPaymentForBooking(bookingId, cfg.isTest);
    const payment = existing && Math.abs(existing.amount - amount) < 0.01
      ? existing
      : await createPayment({ bookingId, amount, isTest: cfg.isTest });

    const event = await db.findEventById(booking.eventId);
    const title = event?.title ?? 'Мероприятие';
    const seats = seatCount(booking);

    const url = buildPaymentLink(cfg, {
      invId: payment.invId,
      amount,
      description: `Участие в мероприятии «${title}»`,
      receiptItems: receiptFor(title, seats, amount, cfg.tax),
    });

    console.log(JSON.stringify({
      action: 'robokassa_payment_started',
      bookingId, invId: payment.invId, amount, isTest: cfg.isTest,
      timestamp: new Date().toISOString(),
    }));

    return res.json({ url, invId: payment.invId, amount: formatSum(amount), isTest: cfg.isTest });
  } catch (err) {
    console.error('[robokassa create]', err);
    return res.status(500).json({ error: 'Не удалось создать платёж' });
  }
});

/**
 * ResultURL — the only place a payment is believed.
 *
 * Robokassa retries until it reads back OK{InvId}, so this has to be safe to
 * run many times for one payment: the repository only moves a row out of
 * `pending` once, and confirming an already-paid booking issues no new tickets.
 */
async function handleResult(req: Request, res: Response) {
  noteSourceIp(req);
  const cfg = getRobokassaConfig();
  if (!cfg.enabled) return res.status(503).send('disabled');

  const verified = verifyResult(cfg, params(req));
  if (!verified.ok) {
    console.warn(JSON.stringify({ action: 'robokassa_result_rejected', reason: verified.reason }));
    return res.status(400).send('bad sign');
  }

  const payment = await findPaymentByInvId(verified.invId);
  if (!payment) {
    console.error(JSON.stringify({ action: 'robokassa_result_unknown_inv', invId: verified.invId }));
    return res.status(404).send('unknown invoice');
  }

  // Already acknowledged: say OK again so Robokassa stops retrying.
  if (payment.status === 'paid') return res.send(resultAck(verified.invId));

  const p = params(req);
  const claimed = Number(verified.outSum);
  if (!Number.isFinite(claimed) || Math.abs(claimed - payment.amount) > 0.01) {
    // The signature was valid, so this is Robokassa — but the amount is not
    // what we asked for. Take the money, flag it, and let a human look.
    console.error(JSON.stringify({
      action: 'robokassa_amount_mismatch',
      invId: verified.invId, expected: payment.amount, received: verified.outSum,
    }));
  }

  const updated = await markPaymentPaid(verified.invId, {
    paymentMethod: p.PaymentMethod ?? p.IncCurrLabel ?? null,
    fee: p.Fee !== undefined ? Number(p.Fee) : null,
    email: p.EMail ?? p.Email ?? null,
    raw: p,
  });
  if (!updated) {
    // Another retry won the race and is confirming right now.
    return res.send(resultAck(verified.invId));
  }

  const result = await confirmBookingPaid(payment.bookingId, 'robokassa');
  if (!result.ok) {
    // The money is real and recorded; only the booking could not follow, most
    // likely because it was cancelled while the guest was on the payment page.
    // Never answer with an error here — that would only make Robokassa retry
    // something no retry can fix.
    console.error(JSON.stringify({
      action: 'robokassa_paid_but_booking_stuck',
      invId: verified.invId, bookingId: payment.bookingId, error: result.error,
    }));
    void alertAdmin(`⚠️ Оплата прошла, но бронь не подтвердилась.\n\nСчёт ${verified.invId}, бронь ${payment.bookingId}, сумма ${verified.outSum} ₽.\nПричина: ${result.error}`);
  }

  console.log(JSON.stringify({
    action: 'robokassa_result_ok',
    invId: verified.invId, bookingId: payment.bookingId, amount: verified.outSum,
    timestamp: new Date().toISOString(),
  }));

  return res.send(resultAck(verified.invId));
}

async function alertAdmin(text: string): Promise<void> {
  const chatId = Number(process.env.TELEGRAM_ADMIN_CHAT_ID ?? 0);
  if (!Number.isFinite(chatId) || chatId === 0) return;
  try {
    await sendTelegramMessage(chatId, text);
  } catch (err) {
    console.error('[robokassa alertAdmin]', err);
  }
}

router.get('/robokassa/result', handleResult);
router.post('/robokassa/result', handleResult);

/** SuccessURL — a page, not a decision. The booking was settled on ResultURL. */
async function handleSuccess(req: Request, res: Response) {
  const cfg = getRobokassaConfig();
  const verified = cfg.enabled ? verifySuccess(cfg, params(req)) : { ok: false, invId: 0, outSum: '' };

  if (!verified.ok) {
    return res.status(200).send(resultPage(
      'Не удалось подтвердить оплату',
      'Если деньги списались, билет придёт в течение нескольких минут. Если нет — напишите организатору.',
      'bad',
    ));
  }
  return res.status(200).send(resultPage(
    'Оплата прошла',
    'Билет придёт сообщением в течение минуты. Он же появится в приложении, в разделе «Мои билеты».',
    'ok',
  ));
}

router.get('/robokassa/success', handleSuccess);
router.post('/robokassa/success', handleSuccess);

/** FailURL — the guest backed out or the payment did not go through. */
function handleFail(_req: Request, res: Response) {
  return res.status(200).send(resultPage(
    'Оплата не прошла',
    'Деньги не списаны. Место держим до конца брони — можно попробовать ещё раз.',
    'bad',
  ));
}

router.get('/robokassa/fail', handleFail);
router.post('/robokassa/fail', handleFail);

export default router;
