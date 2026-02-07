/**
 * In-process scheduler for booking expiration
 * Runs every 60 seconds without external dependencies
 */

import { expireStaleBookings } from '../../domain/bookings';

/**
 * Interval handle
 */
let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Configuration
 */
const EXPIRATION_CHECK_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Start the booking expiration job
 * Runs expireStaleBookings every 60 seconds
 * Never crashes the app - catches and logs all errors
 */
export function startBookingExpirationJob(): void {
  if (intervalHandle !== null) {
    console.warn('[BookingExpirationJob] Job already started, skipping');
    return;
  }

  console.log('[BookingExpirationJob] Starting (interval: 60s)');

  intervalHandle = setInterval(async () => {
    try {
      const expiredCount = expireStaleBookings();
      if (expiredCount > 0) {
        console.log(`[BookingExpirationJob] Expired ${expiredCount} stale bookings`);
      }
    } catch (err) {
      // Never crash the app - log and continue
      console.error('[BookingExpirationJob] Error during execution:', err);
    }
  }, EXPIRATION_CHECK_INTERVAL_MS);

  // Allow process to exit even with this interval running
  if (intervalHandle.unref) {
    intervalHandle.unref();
  }
}

/**
 * Stop the booking expiration job (for testing/shutdown)
 */
export function stopBookingExpirationJob(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[BookingExpirationJob] Stopped');
  }
}

/**
 * Get job status
 */
export function isBookingExpirationJobRunning(): boolean {
  return intervalHandle !== null;
}
