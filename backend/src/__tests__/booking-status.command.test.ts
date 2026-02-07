/**
 * Tests for /booking_status <bookingId> command handler
 * Run with: npx ts-node src/__tests__/booking-status.command.test.ts
 */

import {
  formatBookingStatusMessage,
  formatBookingStatusMessageSecure,
  getBookingStatusData,
} from '../infra/telegram/booking-status.command';
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

console.log('\n📋 Telegram Booking Status Command Tests\n');

// ============================================================================
// Test 1: /booking_status with no bookingId returns error
// ============================================================================

runTest('formatBookingStatusMessage: no bookingId returns usage error', () => {
  const message = formatBookingStatusMessage(undefined);

  assert(
    message.includes('Не указан ID бронирования') || message.includes('Ошибка'),
    'Should include error about missing bookingId'
  );
  assert(
    message.includes('/booking_status'),
    'Should include usage example'
  );
});

runTest('formatBookingStatusMessage: empty bookingId returns usage error', () => {
  const message = formatBookingStatusMessage('');

  assert(
    message.includes('Не указан ID бронирования') || message.includes('Ошибка'),
    'Should include error about empty bookingId'
  );
});

runTest('formatBookingStatusMessage: whitespace-only bookingId returns error', () => {
  const message = formatBookingStatusMessage('   ');

  assert(
    message.includes('Не указан ID бронирования') || message.includes('Ошибка'),
    'Should include error about empty bookingId'
  );
});

// ============================================================================
// Test 2: /booking_status with nonexistent booking returns error
// ============================================================================

runTest('formatBookingStatusMessage: nonexistent booking returns error', () => {
  const originalGetStatus = bookingStatus.getBookingStatus;
  
  try {
    (bookingStatus as any).getBookingStatus = (id: string) => null;

    const message = formatBookingStatusMessage('nonexistent-bk-123');

    assert(
      message.includes('не найдено') || message.includes('Ошибка'),
      'Should include error about booking not found'
    );
    assert(
      message.includes('nonexistent-bk-123'),
      'Should include the booking ID in error'
    );
  } finally {
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 3: /booking_status with authorization check
// ============================================================================

runTest('formatBookingStatusMessageSecure: unauthorized chat returns empty string', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  
  try {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

    const message = formatBookingStatusMessageSecure('999999999', 'bk-123');

    assert(
      message === '',
      'Should return empty string for unauthorized chat'
    );
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  }
});

// ============================================================================
// Test 4: /booking_status with valid booking
// ============================================================================

runTest('formatBookingStatusMessage: valid booking returns status', () => {
  const originalGetStatus = bookingStatus.getBookingStatus;
  
  try {
    (bookingStatus as any).getBookingStatus = () => ({
      bookingId: 'bk-123',
      eventId: 'evt-456',
      status: 'active',
      seatsBooked: 4,
      expiresAt: Date.now() + 60000,
      payment: null,
    });

    const message = formatBookingStatusMessage('bk-123');

    assert(
      message.includes('bk-123'),
      'Should include booking ID'
    );
    assert(
      message.includes('evt-456'),
      'Should include event ID'
    );
    assert(
      message.includes('4'),
      'Should include seat count'
    );
    assert(
      message.includes('Активна') || message.includes('active'),
      'Should include booking status'
    );
  } finally {
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 5: /booking_status with payment info
// ============================================================================

runTest('formatBookingStatusMessage: includes payment status when available', () => {
  const originalGetStatus = bookingStatus.getBookingStatus;
  
  try {
    (bookingStatus as any).getBookingStatus = () => ({
      bookingId: 'bk-123',
      eventId: 'evt-456',
      status: 'active',
      payment: {
        status: 'paid',
        amount: 5000,
        confirmedBy: 'admin',
        confirmedAt: '2026-02-07T10:00:00Z',
      },
    });

    const message = formatBookingStatusMessage('bk-123');

    assert(
      message.includes('💰') || message.includes('Информация об оплате'),
      'Should include payment section'
    );
    assert(
      message.includes('5000'),
      'Should include payment amount'
    );
    assert(
      message.includes('Оплачено') || message.includes('paid'),
      'Should include payment status'
    );
  } finally {
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Test 6: getBookingStatusData function
// ============================================================================

runTest('getBookingStatusData: returns null for undefined bookingId', () => {
  const result = getBookingStatusData(undefined);

  assert(
    result === null,
    'Should return null for undefined bookingId'
  );
});

runTest('getBookingStatusData: calls getBookingStatus with trimmed ID', () => {
  const originalGetStatus = bookingStatus.getBookingStatus;
  let capturedId: string | undefined;

  try {
    (bookingStatus as any).getBookingStatus = (id: string) => {
      capturedId = id;
      return null;
    };

    getBookingStatusData('  bk-123  ');

    assert(
      capturedId === 'bk-123',
      'Should trim and pass bookingId to getBookingStatus'
    );
  } finally {
    (bookingStatus as any).getBookingStatus = originalGetStatus;
  }
});

// ============================================================================
// Print Results
// ============================================================================

console.log(`\n${'='.repeat(50)}`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log(`${'='.repeat(50)}\n`);

process.exit(testsFailed > 0 ? 1 : 0);
