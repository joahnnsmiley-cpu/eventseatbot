# /booking_status Command Tests

## Test Suite: telegram.booking-status.test.ts

**Total Tests: 15 ✅ (All Passing)**

### Test Categories

#### 1. Command Parsing (2 tests)
- ✅ `/booking_status` with valid bookingId parses correctly
- ✅ `/booking_status` without bookingId returns unknown error

#### 2. Booking Status Display (5 tests)
- ✅ **Confirmed booking** (no payment yet)
  - Shows booking ID, event, seats, status
  - Shows countdown timer to expiration
  - Shows "⏳ Ожидает оплату" (waiting for payment)

- ✅ **Paid booking** (with confirmation details)
  - Shows `✅ Оплачено` (Paid status)
  - Displays payment amount in rubles
  - Shows who confirmed it (confirmedBy)
  - Shows confirmation timestamp

- ✅ **Expired booking**
  - Shows expired status
  - Displays original expiration time

- ✅ **Pending payment** (awaiting confirmation)
  - Shows `⏳ Ожидает оплату` (Waiting for payment)
  - Displays amount due
  - Indicates "Требуется подтверждение" (Confirmation required)

- ✅ **No seats booked** (optional field handling)
  - Gracefully handles missing seats
  - Still returns complete message

#### 3. Security Tests (2 tests)
- ✅ **Unauthorized chat**
  - Returns empty string for different chat ID
  - Prevents access from non-admin chats

- ✅ **Missing TELEGRAM_ADMIN_CHAT_ID**
  - Returns empty string when environment variable not configured
  - Prevents access when no admin chat is set up

#### 4. Error Handling (2 tests)
- ✅ **Missing bookingId**
  - Returns error message
  - Includes usage example

- ✅ **Booking not found**
  - Returns "не найдено" (not found) message
  - Includes booking ID in error response

#### 5. Time Formatting (2 tests)
- ✅ **Shows hours and minutes countdown**
  - Formats as "2ч 45м" (2 hours 45 minutes)
  - Calculates remaining time correctly

- ✅ **Shows only minutes when < 1 hour**
  - Formats as "30м" (30 minutes)
  - Simplifies display for short durations

#### 6. Error Resilience (1 test)
- ✅ **Never throws on error**
  - Gracefully handles database errors
  - Returns error message instead of crashing
  - Logs error for debugging

#### 7. Format Verification (1 test)
- ✅ **Plain text format (no markdown)**
  - No HTML/bold tags
  - No code formatting tags
  - Uses plain text with separators
  - Uses emojis for visual indicators

## Test Execution

Run tests:
```bash
npx ts-node src/__tests__/telegram.booking-status.test.ts
```

Output:
```
📋 Telegram /booking_status Command Integration Tests

✓ parseCommand: /booking_status with valid bookingId
✓ parseCommand: /booking_status without bookingId returns unknown
✓ formatBookingStatusMessageSecure: confirmed booking without payment
✓ formatBookingStatusMessageSecure: paid booking with confirmation
✓ formatBookingStatusMessageSecure: expired booking
✓ formatBookingStatusMessageSecure: pending payment (not yet paid)
✓ formatBookingStatusMessageSecure: unauthorized chat returns empty
✓ formatBookingStatusMessageSecure: missing TELEGRAM_ADMIN_CHAT_ID denies access
✓ formatBookingStatusMessageSecure: missing bookingId returns error
✓ formatBookingStatusMessageSecure: booking not found returns error
✓ formatBookingStatusMessageSecure: shows hours and minutes countdown
✓ formatBookingStatusMessageSecure: shows only minutes when less than 1 hour
✓ formatBookingStatusMessageSecure: handles missing seats gracefully
✓ formatBookingStatusMessageSecure: never throws on error
✓ formatBookingStatusMessageSecure: uses plain text (no markdown)

============================================================
Tests Passed: 15
Tests Failed: 0
============================================================
```

## No Real Telegram API

All tests use mocked functions:
- `bookingStatus.getBookingStatus()` - Mocked to return test data
- Environment variables - Set via `setEnv()` helper
- No network calls or real bot interactions

## Integration Coverage

Tests verify the complete flow:
1. Command parsing → 2 tests
2. Authorization checking → 2 tests
3. Data retrieval (mocked) → 1 test
4. Message formatting → 10 tests

Total coverage: **15 integration tests**
