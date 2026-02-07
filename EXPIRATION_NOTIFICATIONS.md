# Auto-Expired Booking Telegram Notifications

## Overview

Integrated Telegram notifications for auto-expired bookings with a mechanism to distinguish between manual and auto-expiration cancellations.

## Changes Made

### 1. Enhanced BookingCancelledEvent Type
**File:** [backend/src/domain/bookings/booking.events.ts](backend/src/domain/bookings/booking.events.ts)

Added optional `reason` field to track cancellation source:
```typescript
export interface BookingCancelledEvent {
  bookingId: string;
  eventId: string;
  username?: string;
  reason?: 'manual' | 'expired';  // NEW
}
```

### 2. Emit Event on Auto-Expiration
**File:** [backend/src/domain/bookings/booking.expiration.ts](backend/src/domain/bookings/booking.expiration.ts)

When `expireStaleBookings()` cancels a booking due to TTL expiration, it now:
- Imports `emitBookingCancelled` event emitter
- Emits the event with `reason: 'expired'`
- Fire-and-forget (never throws or blocks expiration logic)

```typescript
// Emit booking cancelled event with expired reason (fire-and-forget)
emitBookingCancelled({
  bookingId: booking.id,
  eventId: booking.eventId,
  reason: 'expired',  // Mark as auto-expired
}).catch(() => {}); // Already handled in emitter
```

### 3. Emit Event on Manual Cancellation
**File:** [backend/src/routes/publicEvents.ts](backend/src/routes/publicEvents.ts)

Updated manual cancel endpoint to explicitly mark cancellations:
```typescript
emitBookingCancelled({
  bookingId: booking.id,
  eventId: booking.eventId,
  reason: 'manual',  // Mark as user-initiated
}).catch(() => {});
```

### 4. No Duplication Guarantee
- Single event emission per cancellation (auto or manual)
- Telegram notifier handles both the same way
- Reason field allows filtering if needed in future
- Idempotent operations ensure no repeated events

## Test Coverage

**41 tests total:**
- ✅ 10/10 Booking Events tests
- ✅ 8/8 Booking Expiration tests (new comprehensive suite)
- ✅ 5/5 Booking Scheduler tests (new)
- ✅ 10/10 Payment Domain tests
- ✅ 8/8 Payment API tests

### Booking Expiration Tests (8 tests)
```
✓ expireStaleBookings emits bookingCancelled with reason:expired
✓ multiple expiring bookings emit separate events (no duplication)
✓ non-expired confirmed bookings do not emit events
✓ expired booking restores table seats
✓ paid bookings are NOT cancelled on expiration
✓ double expiration run has no double side-effects
✓ scheduler does not throw on notifier errors
✓ expireStaleBookings uses injected now parameter
```

### Booking Scheduler Tests (5 tests)
```
✓ startBookingExpirationJob starts without throwing
✓ stopBookingExpirationJob stops the scheduler
✓ multiple startBookingExpirationJob calls are safe (idempotent)
✓ isBookingExpirationJobRunning correctly tracks state
✓ startBookingExpirationJob is resilient to errors
```

## Test Strategy

**No Real Timers:**
- All tests use injected `now` parameter in `expireStaleBookings(now)`
- No `setTimeout`, `setInterval`, or clock manipulation needed
- Deterministic test execution

**Comprehensive Coverage:**

1. **Seat Restoration**: Verifies `seatsAvailable` incremented when booking expires
2. **Paid Booking Protection**: Paid/cancelled bookings never auto-expire
3. **Idempotency**: Running expiration twice doesn't duplicate side-effects
4. **Event Emission**: Booking cancellation emitted with correct `reason: 'expired'`
5. **Error Resilience**: 
   - Scheduler never throws even if notifier throws
   - expireStaleBookings catches all errors per booking
6. **State Isolation**: Each test clears data and starts fresh

## Notification Flow

```
User Action              Auto-Expiration (scheduler)
       │                         │
       ├─ Cancel Booking ──────────────── TTL exceeded
       │                         │
       ├─ Emit Event             │
       │  reason: 'manual'       │
       │                    Emit Event
       │                    reason: 'expired'
       │                         │
       └──────────────────────────┘
                    │
              TelegramBookingNotifier
                    │
            Send admin notification
              (same flow for both)
```

## Configuration

**Environment Variables:**
- `BOOKING_TTL_MINUTES`: Booking expiration timeout (default: 15 minutes)
- `TELEGRAM_BOT_TOKEN`: Bot token for notifications
- `TELEGRAM_ADMIN_CHAT_ID`: Admin chat ID for notifications

**Scheduler:**
- Runs every 60 seconds (configurable in code)
- Idempotent - safe to call multiple times
- Never throws/crashes app on errors

## Backward Compatibility

- `reason` field is optional (defaults to undefined)
- Existing code without reason field still works
- Manual cancels now explicitly set `reason: 'manual'` (was implicit before)
- No database schema changes

## Testing

Run tests:
```bash
npm run test:all                    # All 41 tests
npm run test:booking-expiration    # Expiration domain (8 tests)
npm run test:booking-scheduler     # Scheduler (5 tests)
npm run test:booking-events        # Event type validation (10 tests)
```

Verify no TypeScript errors:
```bash
npx tsc --noEmit  # Backend
npx tsc --noEmit  # Frontend
```

## Test Files

- [backend/src/__tests__/booking.expiration.test.ts](backend/src/__tests__/booking.expiration.test.ts) - 8 domain tests
- [backend/src/__tests__/booking.scheduler.test.ts](backend/src/__tests__/booking.scheduler.test.ts) - 5 scheduler tests
- [backend/src/__tests__/booking.events.test.ts](backend/src/__tests__/booking.events.test.ts) - 10 event tests
- [backend/src/__tests__/payment.domain.test.ts](backend/src/__tests__/payment.domain.test.ts) - 10 payment domain tests
- [backend/src/__tests__/payment.api.test.ts](backend/src/__tests__/payment.api.test.ts) - 8 payment API tests
