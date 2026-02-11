/**
 * Booking expiration utilities
 */

import { db } from '../../db';
import { emitBookingCancelled } from './booking.events';
import { findPaymentsByBookingId } from '../payments/payment.repository';

/**
 * Get booking TTL in minutes from environment or use default
 * Default: 15 minutes
 */
export function getBookingTtlMinutes(): number {
  const ttl = process.env.BOOKING_TTL_MINUTES;
  if (!ttl) return 15;
  const parsed = parseInt(ttl, 10);
  return isFinite(parsed) && parsed > 0 ? parsed : 15;
}

/**
 * Calculate expiration timestamp for a booking
 * @param createdAtMs - creation timestamp in milliseconds
 * @returns ISO string expiration time
 */
export function calculateBookingExpiration(createdAtMs: number): string {
  const ttlMinutes = getBookingTtlMinutes();
  const expiresAtMs = createdAtMs + ttlMinutes * 60 * 1000;
  return new Date(expiresAtMs).toISOString();
}

/**
 * Check if a booking has expired
 * @param expiresAt - ISO string expiration time
 * @returns true if booking has expired
 */
export function isBookingExpired(expiresAt: string): boolean {
  return new Date(expiresAt) <= new Date();
}

/**
 * Check if a booking has a paid payment
 * If payment exists and status is 'paid', booking should not expire
 * @param bookingId - Booking ID to check
 * @returns true if booking has a paid payment
 */
export function hasPaymentPaid(bookingId: string): boolean {
  const payments = findPaymentsByBookingId(bookingId);
  return payments.some((p) => p.status === 'paid');
}

/**
 * Expire stale reserved bookings
 * - Find all reserved bookings with expiresAt < now
 * - Skip bookings with paid payments (never expire if paid)
 * - Cancel each booking and restore table seats
 * - Idempotent and never throws
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Number of bookings expired
 */
export async function expireStaleBookings(now: Date = new Date()): Promise<number> {
  try {
    const bookings = await db.getBookings();
    let expiredCount = 0;

    // Find reserved bookings that have expired
    const staleBookings = bookings.filter((b: any) => {
      return (
        b.status === 'reserved' &&
        b.expiresAt &&
        new Date(b.expiresAt) <= now &&
        !hasPaymentPaid(b.id) // Do NOT expire if payment is paid
      );
    });

    if (staleBookings.length === 0) {
      return 0;
    }

    // Process each stale booking
    for (const booking of staleBookings) {
      try {
        // Cancel the booking (status -> expired). seats_available is computed from bookings on read.
        await db.updateBookingStatus(booking.id, 'expired');
        console.log(JSON.stringify({
          action: 'booking_expired',
          bookingId: booking.id,
          eventId: booking.eventId,
          timestamp: new Date().toISOString(),
        }));
        
        // Emit booking cancelled event with expired reason (fire-and-forget)
        emitBookingCancelled({
          bookingId: booking.id,
          eventId: booking.eventId,
          reason: 'expired',
        }).catch(() => {}); // Already handled in emitter
        
        expiredCount++;
      } catch (err) {
        // Log but continue with other bookings
        console.error(`[BookingExpiration] Failed to expire booking ${booking.id}:`, err);
      }
    }

    return expiredCount;
  } catch (err) {
    // Never throw - log and return 0
    console.error('[BookingExpiration] Error in expireStaleBookings:', err);
    return 0;
  }
}
