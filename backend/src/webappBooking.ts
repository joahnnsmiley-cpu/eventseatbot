/**
 * Create a pending booking from Telegram WebApp payload (eventId, tableId, seats, phone).
 * Used by POST /telegram/webapp and by the bot when it receives web_app_data.
 */
import { db } from './db';
import type { Booking } from './models';
import { v4 as uuid } from 'uuid';
import { getPriceForTable } from './utils/getTablePrice';

export type WebAppBookingPayload = {
  eventId: string;
  tableId: string;
  seats: number[];
  phone: string;
};

export async function createPendingBookingFromWebAppPayload(payload: WebAppBookingPayload): Promise<{ id: string }> {
  const { eventId, tableId, seats, phone } = payload;
  if (!eventId || !tableId) {
    throw new Error('eventId and tableId are required');
  }
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
  if (!normalizedPhone) {
    throw new Error('phone is required');
  }
  const seatIndices: number[] = Array.isArray(seats) ? seats.filter((s: number) => Number.isInteger(s)) : [];
  if (seatIndices.length === 0) {
    throw new Error('seats must be a non-empty array of seat indices');
  }

  const ev = (await db.findEventById(String(eventId))) as any;
  if (!ev || (ev.published !== true && ev.status !== 'published')) {
    throw new Error('Event not found');
  }
  const tbl = Array.isArray(ev.tables) ? ev.tables.find((t: any) => t.id === tableId) : null;
  if (!tbl) {
    throw new Error('Table not found');
  }
  if (tbl.isAvailable !== true) {
    throw new Error('Table is not available for sale');
  }

  const seatPriceFallback = Array.isArray(ev.ticketCategories)
    ? (ev.ticketCategories as { isActive?: boolean; price?: number }[]).find((c) => c.isActive)?.price ?? 0
    : 0;
  const pricePerSeat = getPriceForTable(ev, tbl, seatPriceFallback);
  const totalAmount = seatIndices.length * pricePerSeat;
  if (totalAmount <= 0) {
    throw new Error('Cannot create booking: price is not configured for this table');
  }

  const id = uuid();
  const createdAt = Date.now();
  const booking: Booking = {
    id,
    eventId: String(eventId),
    tableId: String(tableId),
    seatsBooked: seatIndices.length,
    seatIndices: [...seatIndices],
    userPhone: normalizedPhone,
    status: 'pending',
    createdAt,
    userTelegramId: 0,
    username: '',
    seatIds: [],
    totalAmount,
  };
  await db.addBooking(booking);
  return { id: booking.id };
}
