/**
 * Booking Status Query Helper
 * Retrieves complete booking status including payment information
 */

import { db } from '../../db';
import { findPaymentById, getAllPayments } from '../payments';
import type { Booking } from '../../models';

export interface BookingStatusResult {
  bookingId: string;
  eventId: string;
  seatsBooked?: number;
  status: string;
  expiresAt?: number;
  payment?: {
    status: string;
    amount: number;
    confirmedBy?: string | null;
    confirmedAt?: string | null;
  };
}

/**
 * Get booking status including related payment info
 * Returns null if booking not found
 * Never throws
 */
export async function getBookingStatus(bookingId: string | undefined): Promise<BookingStatusResult | null> {
  try {
    if (!bookingId) {
      return null;
    }

    // Find booking
    const bookings = await db.getBookings();
    const booking = bookings.find((b: Booking) => b.id === bookingId);

    if (!booking) {
      return null;
    }

    const result: BookingStatusResult = {
      bookingId: booking.id,
      eventId: booking.eventId,
      status: booking.status,
    };

    // Add seats booked if available
    if (booking.seatIds && booking.seatIds.length > 0) {
      result.seatsBooked = booking.seatIds.length;
    }

    // Add expiration time if available (ensure it's a number)
    if (typeof booking.expiresAt === 'number' && booking.expiresAt > 0) {
      result.expiresAt = booking.expiresAt;
    }

    // Find related payment
    const allPayments = getAllPayments();
    const payment = allPayments.find((p: any) => p.bookingId === bookingId);

    if (payment) {
      result.payment = {
        status: payment.status,
        amount: payment.amount,
        confirmedBy: payment.confirmedBy || null,
        confirmedAt: payment.confirmedAt || null,
      };
    }

    return result;
  } catch (err) {
    console.error('[BookingStatus] Error getting booking status:', err);
    return null;
  }
}
