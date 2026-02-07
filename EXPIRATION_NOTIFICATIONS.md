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

**31 tests total:**
- ✅ 10/10 Booking Events tests (includes reason field tests)
- ✅ 3/3 Booking Expiration tests (verifies emit on auto-expiry)
- ✅ 10/10 Payment Domain tests
- ✅ 8/8 Payment API tests

### Key Expiration Tests
```
✓ expireStaleBookings emits bookingCancelled with reason:expired
✓ multiple expiring bookings emit separate events (no duplication)
✓ non-expired confirmed bookings do not emit events
```

### Event Type Tests
```
✓ bookingCancelled with reason:expired
✓ bookingCancelled with reason:manual
```

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
npm run test:all                    # All 31 tests
npm run test:booking-expiration    # Expiration-specific (3 tests)
npm run test:booking-events        # Event type validation (10 tests)
```

Verify no TypeScript errors:
```bash
npx tsc --noEmit  # Backend
npx tsc --noEmit  # Frontend
```
