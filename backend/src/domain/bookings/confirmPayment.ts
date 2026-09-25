/**
 * Turning a booking into a paid one with tickets.
 *
 * This used to live inside the admin route, which was fine while a human
 * pressing "confirm" was the only way money could be acknowledged. Robokassa's
 * ResultURL is now a second way in, and both have to produce exactly the same
 * thing — same tickets, same delivery, same log lines — so it lives here and
 * both call it.
 */

import { v4 as uuid } from 'uuid';
import { db } from '../../db';
import { sendTelegramMessage, sendTelegramPhoto } from '../../services/telegramService';
import { sendVkMessage, sendVkPhoto } from '../../services/vkService';
import { generateTicket } from '../../services/ticketGenerator';
import type { Booking, Ticket } from '../../models';

const CONFIRMED_TEXT = '✅ Оплата подтверждена\n\nЖдём вас на мероприятии!';

/** Seats for the ticket face: indices as "1, 2, 3" (human 1-based), else the count. */
export function formatSeatsForTicket(booking: {
  seatIndices?: number[];
  seatsBooked?: number;
  tableBookings?: { seats: number }[];
}): string {
  if (Array.isArray(booking.seatIndices) && booking.seatIndices.length > 0) {
    const sorted = [...booking.seatIndices].sort((a, b) => a - b);
    return sorted.map((i) => i + 1).join(', ');
  }
  const count = booking.seatsBooked ?? booking.tableBookings?.[0]?.seats ?? 0;
  return String(count);
}

/** Whichever messenger the booking came from. */
async function notifyGuest(booking: Booking, text: string, photoUrl?: string): Promise<void> {
  if (booking.platform === 'vk' && booking.user_vk_id) {
    if (photoUrl) await sendVkPhoto(booking.user_vk_id, photoUrl, text);
    else await sendVkMessage(booking.user_vk_id, text);
    return;
  }
  const chatId = typeof booking.userTelegramId === 'number' ? booking.userTelegramId : 0;
  if (!Number.isFinite(chatId) || chatId <= 0) return;
  if (photoUrl) await sendTelegramPhoto(chatId, photoUrl, text);
  else await sendTelegramMessage(chatId, text);
}

/**
 * Fire-and-forget: render the ticket, store its URL, send it.
 * Never throws — a messenger being down must not undo a confirmed payment.
 */
export async function deliverTicket(booking: Booking): Promise<void> {
  try {
    const ev = (await db.findEventById(booking.eventId)) as {
      imageUrl?: string;
      ticketTemplateUrl?: string;
      event_date?: string;
      event_time?: string;
      title?: string;
      tables?: { id: string; number: number }[];
    } | null;
    const tbl = ev?.tables?.find((t) => t.id === booking.tableId);

    const ticketUrl = await generateTicket({
      templateUrl: ev?.ticketTemplateUrl ?? ev?.imageUrl ?? '',
      bookingId: booking.id,
      eventId: booking.eventId,
      eventTitle: ev?.title ?? '',
      eventDate: [ev?.event_date, ev?.event_time].filter(Boolean).join(' ') || '',
      tableNumber: tbl?.number ?? booking.tableId ?? '—',
      seats: formatSeatsForTicket(booking),
    });

    if (ticketUrl) {
      await db.updateBookingTicketFileUrl(booking.id, ticketUrl);
      await notifyGuest(booking, '🎟 Ваш билет', ticketUrl);
    } else {
      await notifyGuest(booking, CONFIRMED_TEXT);
    }
  } catch (err) {
    console.error('[deliverTicket]', err);
    notifyGuest(booking, CONFIRMED_TEXT).catch(() => {});
  }
}

/** One ticket per seat, whichever of the three shapes the booking uses. */
export function buildTickets(booking: Booking, now: number): Ticket[] {
  const tickets: Ticket[] = [];
  const base = { bookingId: booking.id, eventId: booking.eventId, createdAt: now };

  if (Array.isArray(booking.seatIds) && booking.seatIds.length > 0) {
    for (const seatId of booking.seatIds) tickets.push({ id: uuid(), ...base, seatId });
    return tickets;
  }
  if (Array.isArray(booking.tableBookings) && booking.tableBookings.length > 0) {
    for (const tb of booking.tableBookings) {
      for (let i = 0; i < (Number(tb.seats) || 0); i += 1) {
        tickets.push({ id: uuid(), ...base, tableId: tb.tableId });
      }
    }
    return tickets;
  }
  if (booking.tableId && typeof booking.seatsBooked === 'number') {
    for (let i = 0; i < booking.seatsBooked; i += 1) {
      tickets.push({ id: uuid(), ...base, tableId: booking.tableId });
    }
  }
  return tickets;
}

export type ConfirmResult =
  | { ok: true; booking: Booking; tickets: Ticket[]; alreadyPaid: false }
  | { ok: true; booking: Booking; tickets: Ticket[]; alreadyPaid: true }
  | { ok: false; error: string; status: number };

/**
 * Mark a booking paid and issue its tickets.
 *
 * `confirmedBy` only reaches the logs; it says whether a human in the admin or
 * an acquirer callback did this, which is the first thing anyone asks when a
 * booking's history is in doubt.
 */
export async function confirmBookingPaid(
  bookingId: string,
  confirmedBy: 'admin' | 'robokassa',
): Promise<ConfirmResult> {
  const bookings = await db.getBookings();
  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) return { ok: false, error: 'Booking not found', status: 404 };

  // Already paid is not an error: Robokassa retries its notification until it
  // gets an OK, and the admin may press confirm twice. Report success without
  // minting a second set of tickets.
  if (booking.status === 'paid') {
    return { ok: true, booking, tickets: booking.tickets ?? [], alreadyPaid: true };
  }

  const confirmable = ['reserved', 'awaiting_confirmation', 'payment_submitted', 'expired', 'pending'];
  if (!confirmable.includes(String(booking.status))) {
    return { ok: false, error: `Cannot confirm booking with status: ${booking.status}`, status: 400 };
  }

  const tickets = buildTickets(booking, Date.now());

  const updated = await db.updateBookingStatus(bookingId, 'paid');
  if (!updated) return { ok: false, error: 'Failed to update booking status', status: 500 };
  await db.updateBookingTickets(bookingId, tickets);

  console.log(JSON.stringify({
    action: 'payment_confirmed',
    bookingId: booking.id,
    eventId: booking.eventId,
    confirmedBy,
    ticketsCount: tickets.length,
    timestamp: new Date().toISOString(),
  }));

  void deliverTicket(updated);

  return { ok: true, booking: updated, tickets, alreadyPaid: false };
}
