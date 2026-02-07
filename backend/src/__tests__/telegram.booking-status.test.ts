/**
 * Telegram Admin Commands Integration Tests
 * Tests for /booking_status command
 * Covers: parsing, security, execution, error handling, formatting
 * No real Telegram API used - all mocked
 */

import { parseCommand } from '../infra/telegram/telegram.commands';
import { formatBookingStatusMessageSecure } from '../infra/telegram/booking-status.command';
import * as bookingStatus from '../domain/bookings/booking.status';

// Track test results
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ${message}`);
    testsFailed++;
    throw new Error(message);
  }
}

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (err) {
    // Error already logged by assert
  }
}

// Helper to set env var
function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

console.log('\n📋 Telegram /booking_status Command Integration Tests\n');

// ============================================================================
// Test 1: Command parsing
// ============================================================================

runTest('parseCommand: /booking_status with valid bookingId', () => {
  const parsed = parseCommand('/booking_status bk-123');
  assert(parsed.type === 'booking_status', 'Should parse as booking_status');
  assert(parsed.bookingId === 'bk-123', 'Should extract bookingId');
});

runTest('parseCommand: /booking_status without bookingId returns unknown', () => {
  const parsed = parseCommand('/booking_status');
  assert(parsed.type === 'unknown', 'Should return unknown without bookingId');
});

// ============================================================================
// Test 2: Confirmed booking (no payment)
// ============================================================================

runTest('formatBookingStatusMessageSecure: confirmed booking without payment', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetStatus = bookingStatus.getBookingStatus;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    (bookingStatus as any).getBookingStatus = () => ({
      bookingId: 'bk-confirmed-001',
      eventId: 'evt-2026-gala',
      status: 'confirmed',
      seatsBooked: 2,
      expiresAt: Date.now() + 3600000, // 1 hour from now
      payment: null,
    });

    const message = formatBookingStatusMessageSecure('123456789', 'bk-confirmed-001');

    assert(message.length > 0, 'Should return non-empty message for authorized chat');
    assert(message.includes('СТАТУС БРОНИРОВАНИЯ'), 'Should include header');
    assert(message.includes('bk-confirmed-001'), 'Should include booking ID');
    assert(message.includes('evt-2026-gala'), 'Should include event ID');
    assert(message.includes('2'), 'Should include seat count');
    assert(message.includes('Истекает через'), 'Should show expiration countdown');
    assert(message.includes('⏳ Ожидает оплату'), 'Should show waiting for payment');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 3: Paid booking (with confirmation details)
// ============================================================================

runTest('formatBookingStatusMessageSecure: paid booking with confirmation', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetStatus = bookingStatus.getBookingStatus;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    const confirmedTime = '2026-02-08T10:30:00Z';

    (bookingStatus as any).getBookingStatus = () => ({
      bookingId: 'bk-paid-001',
      eventId: 'evt-2026-gala',
      status: 'confirmed',
      seatsBooked: 4,
      expiresAt: Date.now() + 7200000, // 2 hours from now
      payment: {
        status: 'paid',
        amount: 10000,
        confirmedBy: 'admin-user',
        confirmedAt: confirmedTime,
      },
    });

    const message = formatBookingStatusMessageSecure('123456789', 'bk-paid-001');

    assert(message.length > 0, 'Should return message');
    assert(message.includes('✅ Оплачено'), 'Should show paid status with checkmark');
    assert(message.includes('10000 ₽'), 'Should include payment amount');
    assert(message.includes('admin-user'), 'Should show who confirmed');
    assert(message.includes('💰 ИНФОРМАЦИЯ ОБ ОПЛАТЕ'), 'Should have payment section');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 4: Expired booking
// ============================================================================

runTest('formatBookingStatusMessageSecure: expired booking', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetStatus = bookingStatus.getBookingStatus;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    const expiredTime = Date.now() - 3600000; // 1 hour ago (expired)

    (bookingStatus as any).getBookingStatus = () => ({
      bookingId: 'bk-expired-001',
      eventId: 'evt-2026-gala',
      status: 'expired',
      seatsBooked: 1,
      expiresAt: expiredTime,
      payment: null,
    });

    const message = formatBookingStatusMessageSecure('123456789', 'bk-expired-001');

    assert(message.length > 0, 'Should return message for expired booking');
    assert(message.includes('Истекла'), 'Should show expired status indicator');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 5: Pending payment status
// ============================================================================

runTest('formatBookingStatusMessageSecure: pending payment (not yet paid)', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetStatus = bookingStatus.getBookingStatus;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    (bookingStatus as any).getBookingStatus = () => ({
      bookingId: 'bk-pending-001',
      eventId: 'evt-2026-gala',
      status: 'confirmed',
      seatsBooked: 3,
      expiresAt: Date.now() + 1800000, // 30 minutes from now
      payment: {
        status: 'pending',
        amount: 7500,
        confirmedBy: null,
        confirmedAt: null,
      },
    });

    const message = formatBookingStatusMessageSecure('123456789', 'bk-pending-001');

    assert(message.includes('⏳ Ожидает оплату'), 'Should show pending payment status');
    assert(message.includes('7500 ₽'), 'Should show amount due');
    assert(message.includes('Требуется подтверждение'), 'Should indicate confirmation needed');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 6: Unauthorized chat (security)
// ============================================================================

runTest('formatBookingStatusMessageSecure: unauthorized chat returns empty', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    // Different chat ID should be unauthorized
    const message = formatBookingStatusMessageSecure('999999999', 'bk-123');

    assert(message === '', 'Should return empty string for unauthorized chat');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  }
});

runTest('formatBookingStatusMessageSecure: missing TELEGRAM_ADMIN_CHAT_ID denies access', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', undefined);

  try {
    const message = formatBookingStatusMessageSecure('123456789', 'bk-123');

    assert(message === '', 'Should return empty string when admin chat not configured');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  }
});

// ============================================================================
// Test 7: Missing bookingId
// ============================================================================

runTest('formatBookingStatusMessageSecure: missing bookingId returns error', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    const message = formatBookingStatusMessageSecure('123456789', '');

    assert(
      message.includes('Не указан ID') || message.includes('Ошибка'),
      'Should return error for missing bookingId'
    );
    assert(message.includes('/booking_status'), 'Should include usage example');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  }
});

// ============================================================================
// Test 8: Booking not found
// ============================================================================

runTest('formatBookingStatusMessageSecure: booking not found returns error', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetStatus = bookingStatus.getBookingStatus;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    (bookingStatus as any).getBookingStatus = () => null;

    const message = formatBookingStatusMessageSecure('123456789', 'bk-nonexistent');

    assert(message.includes('не найдено'), 'Should include "not found" message');
    assert(message.includes('bk-nonexistent'), 'Should include booking ID in error');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 9: Time formatting (expiration countdown)
// ============================================================================

runTest('formatBookingStatusMessageSecure: shows hours and minutes countdown', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetStatus = bookingStatus.getBookingStatus;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    // Set expiration to 2 hours 45 minutes from now
    const expiresAt = Date.now() + (2 * 60 + 45) * 60000;

    (bookingStatus as any).getBookingStatus = () => ({
      bookingId: 'bk-time-001',
      eventId: 'evt-time',
      status: 'confirmed',
      expiresAt: expiresAt,
      payment: null,
    });

    const message = formatBookingStatusMessageSecure('123456789', 'bk-time-001');

    assert(message.includes('ч') && message.includes('м'), 'Should show hours and minutes');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

runTest('formatBookingStatusMessageSecure: shows only minutes when less than 1 hour', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetStatus = bookingStatus.getBookingStatus;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    // Set expiration to 30 minutes from now
    const expiresAt = Date.now() + 30 * 60000;

    (bookingStatus as any).getBookingStatus = () => ({
      bookingId: 'bk-mins-001',
      eventId: 'evt-mins',
      status: 'confirmed',
      expiresAt: expiresAt,
      payment: null,
    });

    const message = formatBookingStatusMessageSecure('123456789', 'bk-mins-001');

    assert(
      message.includes('30м') || message.includes('29м') || message.includes('31м'),
      'Should show minutes only (with tolerance)'
    );
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 10: No seats booked (optional field)
// ============================================================================

runTest('formatBookingStatusMessageSecure: handles missing seats gracefully', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetStatus = bookingStatus.getBookingStatus;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    (bookingStatus as any).getBookingStatus = () => ({
      bookingId: 'bk-no-seats',
      eventId: 'evt-2026',
      status: 'confirmed',
      expiresAt: Date.now() + 3600000,
      // seatsBooked is undefined
      payment: null,
    });

    const message = formatBookingStatusMessageSecure('123456789', 'bk-no-seats');

    assert(message.length > 0, 'Should return message even without seats');
    assert(message.includes('bk-no-seats'), 'Should include booking ID');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 11: Error handling (never throws)
// ============================================================================

runTest('formatBookingStatusMessageSecure: never throws on error', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetStatus = bookingStatus.getBookingStatus;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    // Mock to throw error
    (bookingStatus as any).getBookingStatus = () => {
      throw new Error('Database error');
    };

    let errorThrown = false;
    let message = '';

    try {
      message = formatBookingStatusMessageSecure('123456789', 'bk-123');
    } catch (err) {
      errorThrown = true;
    }

    assert(!errorThrown, 'Should not throw error');
    assert(message.includes('Ошибка'), 'Should return error message');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 12: Plain text format (no markdown)
// ============================================================================

runTest('formatBookingStatusMessageSecure: uses plain text (no markdown)', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetStatus = bookingStatus.getBookingStatus;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    (bookingStatus as any).getBookingStatus = () => ({
      bookingId: 'bk-text-001',
      eventId: 'evt-text',
      status: 'confirmed',
      seatsBooked: 2,
      expiresAt: Date.now() + 3600000,
      payment: {
        status: 'paid',
        amount: 5000,
        confirmedBy: 'admin',
        confirmedAt: '2026-02-08T10:00:00Z',
      },
    });

    const message = formatBookingStatusMessageSecure('123456789', 'bk-text-001');

    // Should NOT contain markdown
    assert(!message.includes('<b>'), 'Should not contain bold tags');
    assert(!message.includes('<i>'), 'Should not contain italic tags');
    assert(!message.includes('<code>'), 'Should not contain code tags');

    // Should contain plain text structure
    assert(message.includes('СТАТУС БРОНИРОВАНИЯ'), 'Should contain plain header');
    assert(message.includes('========'), 'Should use separator lines');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Print Results
// ============================================================================

console.log(`\n${'='.repeat(60)}`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log(`${'='.repeat(60)}\n`);

process.exit(testsFailed > 0 ? 1 : 0);
