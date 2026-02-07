/**
 * Domain layer for booking events
 * Decouples domain from notification infrastructure
 */

export interface BookingCreatedEvent {
  bookingId: string;
  eventId: string;
  username?: string;
  seats?: number;
  totalAmount?: number;
}

export interface BookingCancelledEvent {
  bookingId: string;
  eventId: string;
  username?: string;
  reason?: 'manual' | 'expired';
}

/**
 * Notifier interface for booking events
 * Can be implemented by any notification system (Telegram, Email, etc.)
 */
export interface BookingEventNotifier {
  bookingCreated(event: BookingCreatedEvent): Promise<void>;
  bookingCancelled(event: BookingCancelledEvent): Promise<void>;
}

/**
 * NOOP notifier - does nothing by default
 * Prevents errors when no real notifier is configured
 */
const noopNotifier: BookingEventNotifier = {
  async bookingCreated() {},
  async bookingCancelled() {},
};

/**
 * Current notifier instance
 * Defaults to NOOP, can be injected via setBookingEventNotifier()
 */
let notifier: BookingEventNotifier = noopNotifier;

/**
 * Set the booking event notifier
 * Should be called during application initialization
 */
export function setBookingEventNotifier(n: BookingEventNotifier): void {
  notifier = n;
}

/**
 * Emit booking created event
 * Never throws - catches and logs all errors
 */
export async function emitBookingCreated(event: BookingCreatedEvent): Promise<void> {
  try {
    await notifier.bookingCreated(event);
  } catch (err) {
    console.error('[BookingEvents] Error emitting bookingCreated:', err);
  }
}

/**
 * Emit booking cancelled event
 * Never throws - catches and logs all errors
 */
export async function emitBookingCancelled(event: BookingCancelledEvent): Promise<void> {
  try {
    await notifier.bookingCancelled(event);
  } catch (err) {
    console.error('[BookingEvents] Error emitting bookingCancelled:', err);
  }
}
