/**
 * Booking expiration utilities
 */

import { getEvents, getBookings, updateBookingStatus, saveEvents } from '../../db';
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
 * Expire stale confirmed bookings
 * - Find all confirmed bookings with expiresAt < now
 * - Skip bookings with paid payments (never expire if paid)
 * - Cancel each booking and restore table seats
 * - Idempotent and never throws
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Number of bookings expired
 */
export function expireStaleBookings(now: Date = new Date()): number {
  try {
    const bookings = getBookings();
    const events = getEvents();
    let expiredCount = 0;

    // Find confirmed bookings that have expired
    const staleBookings = bookings.filter((b: any) => {
      return (
        b.status === 'confirmed' &&
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
        // Find the event and table to restore seats
        const event = events.find((e: any) => e.id === booking.eventId);
        if (event && Array.isArray(event.tables) && booking.tableId) {
          const table = event.tables.find((t: any) => t.id === booking.tableId);
          if (table && typeof booking.seatsBooked === 'number') {
            // Restore seats (bounded by seatsTotal)
            table.seatsAvailable = Math.min(
              table.seatsTotal,
              (Number(table.seatsAvailable) || 0) + booking.seatsBooked,
            );
          }
        }

        // Cancel the booking
        updateBookingStatus(booking.id, 'cancelled');
        
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

    // Persist events if any seats were restored
    if (expiredCount > 0) {
      try {
        saveEvents(events);
      } catch (err) {
        console.error('[BookingExpiration] Failed to persist events after expiring bookings:', err);
      }
    }

    return expiredCount;
  } catch (err) {
    // Never throw - log and return 0
    console.error('[BookingExpiration] Error in expireStaleBookings:', err);
    return 0;
  }
}
