/**
 * Domain layer exports
 */

export {
  emitBookingCreated,
  emitBookingCancelled,
  setBookingEventNotifier,
  type BookingCreatedEvent,
  type BookingCancelledEvent,
  type BookingEventNotifier,
} from './booking.events';

export {
  getBookingTtlMinutes,
  calculateBookingExpiration,
  isBookingExpired,
  expireStaleBookings,
} from './booking.expiration';
