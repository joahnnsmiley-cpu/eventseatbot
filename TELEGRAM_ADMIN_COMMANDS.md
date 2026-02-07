# Telegram Admin Commands Extension - Implementation Summary

## Overview
Extended Telegram admin commands support with `/booking_status <bookingId>` command and improved error handling for unknown/malformed commands.

## Changes Made

### 1. **Command Parser Updates** ([telegram.commands.ts](backend/src/infra/telegram/telegram.commands.ts))
- **Extended `ParsedCommand` interface** to support new command type:
  - Added `booking_status` type
  - Added `bookingId` field to extract booking ID from command

- **Updated `parseCommand()` function** to handle:
  - `/booking_status <bookingId>` - Parses booking ID from command
  - Validates bookingId is provided
  - Returns `{ type: 'unknown' }` if bookingId is missing

### 2. **New Booking Status Command Handler** ([booking-status.command.ts](backend/src/infra/telegram/booking-status.command.ts))
- **`formatBookingStatusMessage(bookingId)`** - Core formatter
  - Returns error message if bookingId is missing/empty
  - Returns helpful usage example in error cases
  - Displays booking details: ID, event, seats, status, expiration
  - Includes payment information if available
  - Formats status values for display (🟢 Active, 🟡 Pending, etc.)
  - Never throws, logs errors silently

- **`formatBookingStatusMessageSecure(chatId, bookingId)`** - Security wrapper
  - Checks authorization before processing
  - Returns empty string if unauthorized
  - Logs unauthorized access attempts

- **`getBookingStatusData(bookingId)`** - Data accessor
  - Safely retrieves booking status
  - Handles missing/empty IDs gracefully
  - Never throws

### 3. **Booking Status Query Helper** ([booking.status.ts](backend/src/domain/bookings/booking.status.ts))
- **`getBookingStatus(bookingId)`** - Retrieves complete booking data
  - Finds booking from database
  - Extracts seat count from seatIds array
  - Retrieves related payment information
  - Returns typed `BookingStatusResult` object
  - Never throws, returns null on error

- **`BookingStatusResult` interface** - Structured response
  ```typescript
  {
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
  ```

### 4. **Bot Message Handler Integration** ([bot.ts](backend/src/bot.ts))
- **Registered `bot.on('message')` handler** to process admin commands
- **Command routing:**
  - `/pending_payments` → `formatPendingPaymentsMessageSecure()`
  - `/confirm_payment <paymentId>` → `formatConfirmPaymentMessageSecure()`
  - `/booking_status <bookingId>` → `formatBookingStatusMessageSecure()`
  - Unknown/malformed commands → Helpful error message with available commands

- **Error handling:**
  - Silently ignores non-command messages
  - Catches all errors to prevent bot crashes
  - Logs errors for debugging

### 5. **Exports** ([index.ts](backend/src/infra/telegram/index.ts))
- Exported new booking status command functions:
  - `formatBookingStatusMessage`
  - `formatBookingStatusMessageSecure`
  - `getBookingStatusData`

### 6. **Tests**

#### Command Parser Tests ([telegram.commands.test.ts](backend/src/__tests__/telegram.commands.test.ts))
- ✅ `/booking_status` with bookingId parses correctly
- ✅ Complex booking IDs handled
- ✅ Extra spaces trimmed
- ✅ Case insensitive parsing
- ✅ Missing bookingId returns unknown/error
- ✅ Empty bookingId handled
- ✅ Multiple arguments handled (takes first)
- ✅ `isKnownCommand()` recognizes booking_status command
- **Result: 39/39 tests passed**

#### Booking Status Command Tests ([booking-status.command.test.ts](backend/src/__tests__/booking-status.command.test.ts))
- ✅ No bookingId returns usage error
- ✅ Empty bookingId returns error
- ✅ Whitespace-only bookingId returns error
- ✅ Nonexistent booking returns not found error
- ✅ Unauthorized chat returns empty string (secure)
- ✅ Valid booking displays complete status
- ✅ Payment info included when available
- ✅ Data accessor returns null for undefined ID
- ✅ Data accessor trims whitespace
- **Result: 9/9 tests passed**

## Usage

### Admin Commands
```
/pending_payments
  → Lists all pending payments with IDs and amounts

/confirm_payment <paymentId>
  → Confirms payment and updates booking status

/booking_status <bookingId>
  → Shows booking details, expiration, and payment status

/unknown_command
  → Returns helpful error with list of available commands
```

### Response Examples

#### Valid Booking Query
```
📋 Статус Бронирования

Бронь: bk-123
Событие: evt-456
Мест: 4
Статус: 🟢 Активна
Истекает: 7.02.2026, 10:30:00

💰 Информация об оплате
Статус: ✅ Оплачено
Сумма: 5000 ₽
Подтверждено: admin
Время: 7.02.2026, 10:00:00
```

#### Error: Missing bookingId
```
❌ Ошибка: Не указан ID бронирования

Использование: /booking_status <bookingId>

Пример: /booking_status booking_123
```

#### Error: Unknown Command
```
❓ Unknown or Malformed Command

Available admin commands:
• /pending_payments - List all pending payments
• /confirm_payment <paymentId> - Confirm a specific payment
• /booking_status <bookingId> - Get booking status

Example: /booking_status booking_123
```

## Architecture Notes

1. **Security**: All secure functions check authorization before processing
2. **Error Handling**: Never throws - all errors logged and handled gracefully
3. **Type Safety**: Full TypeScript types for all inputs/outputs
4. **Validation**:
   - bookingId validation: non-empty, trimmed
   - Authorization checks: verified against TELEGRAM_ADMIN_CHAT_ID
   - Data existence: gracefully handles missing bookings/payments
5. **Message Format**: HTML formatting for Telegram with emoji indicators

## Testing

Run individual test suites:
```bash
npm run test:telegram-commands       # Command parsing (39 tests)
npx ts-node src/__tests__/booking-status.command.test.ts  # Status handler (9 tests)
```

All tests pass ✅
