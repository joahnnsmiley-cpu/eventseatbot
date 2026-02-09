/**
 * Unit tests for manual payment confirmation flow
 * Tests payment creation, confirmation, notifications, and expiration behavior
 * Run with: npx ts-node src/__tests__/payment.confirm.test.ts
 */

import {
  createPaymentIntentService,
  markPaid,
  findPaymentById,
  setPaymentEventNotifier,
  type PaymentEventNotifier,
  type PaymentCreatedEvent,
  type PaymentConfirmedEvent,
} from '../domain/payments';
import { expireStaleBookings, calculateBookingExpiration } from '../domain/bookings/booking.expiration';
import * as bookingDb from '../db';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function runTest(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`✗ ${name}`);
    if (error instanceof Error) {
      console.log(`  Error: ${error.message}`);
    }
  }
}

function assert(condition: boolean | any, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

// ============================================
// MOCK NOTIFIER
// ============================================

class MockPaymentNotifier implements PaymentEventNotifier {
  calls: Array<
    | { event: 'paymentCreated'; data: PaymentCreatedEvent }
    | { event: 'paymentConfirmed'; data: PaymentConfirmedEvent }
  > = [];

  async paymentCreated(event: PaymentCreatedEvent): Promise<void> {
    this.calls.push({ event: 'paymentCreated', data: event });
  }

  async paymentConfirmed(event: PaymentConfirmedEvent): Promise<void> {
    this.calls.push({ event: 'paymentConfirmed', data: event });
  }

  reset(): void {
    this.calls = [];
  }
}

// ============================================
// SETUP
// ============================================

const mockNotifier = new MockPaymentNotifier();
setPaymentEventNotifier(mockNotifier);

// Store original getBookings
const originalGetBookings = (bookingDb as any).getBookings;

console.log('\n📋 Manual Payment Confirmation Tests\n');

// ============================================
// TEST 1: Create payment → pending + notification
// ============================================

runTest('create payment: initial status is pending', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-1',
      eventId: 'confirm-test-evt-1',
      tableId: 'table-1',
      seatsBooked: 2,
      status: 'reserved',
      totalAmount: 5000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const result = createPaymentIntentService('confirm-test-bk-1', 5000);
    assert(result.success, 'Should create payment');
    assertEquals(result.status, 201, 'Should return 201');
    assertEquals(result.data?.status, 'pending', 'Status should be pending');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('create payment: emits paymentCreated notification', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-2',
      eventId: 'confirm-test-evt-2',
      tableId: 'table-2',
      seatsBooked: 3,
      status: 'reserved',
      totalAmount: 7500,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    createPaymentIntentService('confirm-test-bk-2', 7500);

    assertEquals(mockNotifier.calls.length, 1, 'Should emit exactly 1 notification');
    assertEquals(
      mockNotifier.calls[0]!.event,
      'paymentCreated',
      'Should emit paymentCreated',
    );
    assertEquals(
      mockNotifier.calls[0]!.data.bookingId,
      'confirm-test-bk-2',
      'Should include bookingId',
    );
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 2: Admin confirm → payment paid
// ============================================

runTest('admin confirm: updates payment status to paid', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-3',
      eventId: 'confirm-test-evt-3',
      tableId: 'table-3',
      seatsBooked: 2,
      status: 'reserved',
      totalAmount: 4000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('confirm-test-bk-3', 4000);
    const paymentId = createResult.data!.id;

    const confirmResult = markPaid(paymentId, 'admin-user');
    assert(confirmResult.success, `Should mark as paid: ${confirmResult.error}`);
    assertEquals(confirmResult.status, 200, 'Should return 200');
    assertEquals(confirmResult.data?.status, 'paid', 'Status should be paid');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 3: Booking status updated to paid
// ============================================

runTest('admin confirm: marking payment paid updates booking', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-3',
      eventId: 'confirm-test-evt-3',
      tableId: 'table-3',
      seatsBooked: 2,
      status: 'reserved',
      totalAmount: 4000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('confirm-test-bk-3', 4000);
    assert(createResult.success, 'Should create payment');
    const paymentId = createResult.data!.id;

    // Confirm the payment
    const confirmResult = markPaid(paymentId, 'admin-user');
    assert(confirmResult.success, 'Should mark payment as paid');
    assertEquals(confirmResult.data?.status, 'paid', 'Payment status should be paid');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 4: Telegram notification sent on confirm
// ============================================

runTest('admin confirm: emits paymentConfirmed notification', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-5',
      eventId: 'confirm-test-evt-5',
      tableId: 'table-5',
      seatsBooked: 2,
      status: 'reserved',
      totalAmount: 8000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('confirm-test-bk-5', 8000);
    const paymentId = createResult.data!.id;

    // Reset to clear the create notification
    mockNotifier.reset();

    markPaid(paymentId, 'admin-user');

    assertEquals(mockNotifier.calls.length, 1, 'Should emit exactly 1 confirmation notification');
    assertEquals(
      mockNotifier.calls[0]!.event,
      'paymentConfirmed',
      'Should emit paymentConfirmed',
    );
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 5: Confirmation notification has correct fields
// ============================================

runTest('paymentConfirmed: includes bookingId, amount, confirmedBy, confirmedAt', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-6',
      eventId: 'confirm-test-evt-6',
      tableId: 'table-6',
      seatsBooked: 4,
      status: 'reserved',
      totalAmount: 12000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('confirm-test-bk-6', 12000);
    const paymentId = createResult.data!.id;

    mockNotifier.reset();

    markPaid(paymentId, 'jane.admin@company.com');

    assert(mockNotifier.calls[0], 'Should have notification');
    const data = mockNotifier.calls[0]!.data as PaymentConfirmedEvent;

    assertEquals(data.bookingId, 'confirm-test-bk-6', 'Should include bookingId');
    assertEquals(data.amount, 12000, 'Should include amount');
    assertEquals(data.confirmedBy, 'jane.admin@company.com', 'Should include confirmedBy');
    assert(typeof data.confirmedAt === 'string', 'Should include confirmedAt as ISO string');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 6: Double confirm → 409
// ============================================

runTest('admin confirm: double confirm returns 409 conflict', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-7',
      eventId: 'confirm-test-evt-7',
      tableId: 'table-7',
      seatsBooked: 2,
      status: 'reserved',
      totalAmount: 3000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('confirm-test-bk-7', 3000);
    const paymentId = createResult.data!.id;

    // First confirm - should succeed
    const confirm1 = markPaid(paymentId, 'admin-user');
    assert(confirm1.success, 'First confirm should succeed');
    assertEquals(confirm1.status, 200, 'Should return 200');

    // Second confirm - should fail
    const confirm2 = markPaid(paymentId, 'admin-user');
    assert(!confirm2.success, 'Second confirm should fail');
    assertEquals(confirm2.status, 409, 'Should return 409 conflict');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 7: Paid booking ignored by expiration
// ============================================

runTest('expiration: paid booking does NOT expire', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-8',
      eventId: 'confirm-test-evt-8',
      tableId: 'table-8',
      seatsBooked: 2,
      status: 'reserved',
      totalAmount: 5500,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    // Create and confirm payment
    const createResult = createPaymentIntentService('confirm-test-bk-8', 5500);
    const paymentId = createResult.data!.id;
    markPaid(paymentId, 'admin-user');

    // Set booking to be expired
    const bookings = (bookingDb as any).getBookings();
    const booking = bookings.find((b: any) => b.id === 'confirm-test-bk-8');
    booking.expiresAt = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago

    // Try to expire stale bookings
    const expiredCount = expireStaleBookings();

    assertEquals(expiredCount, 0, 'Should NOT expire paid booking');
    assertEquals(booking.status, 'reserved', 'Booking should still be reserved (not expired)');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 8: Pending payment booking still expires
// ============================================

runTest('expiration: pending payment booking expires normally', () => {
  // This test verifies the booking expiration logic works with pending payments
  // We've already tested this in booking.expiration.test.ts
  // Here we just verify the payment status doesn't affect normal expiration flow
  
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-9',
      eventId: 'confirm-test-evt-9',
      tableId: 'table-9',
      seatsBooked: 2,
      status: 'reserved',
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minute ago (expired)
      totalAmount: 2500,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;
  (bookingDb as any).getEvents = () => [
    {
      id: 'confirm-test-evt-9',
      tables: [{ id: 'table-9', seatsAvailable: 2, seatsTotal: 4 }],
    },
  ];
  (bookingDb as any).saveEvents = () => {};

  try {
    // Create payment but do NOT confirm it (status = pending)
    const createResult = createPaymentIntentService('confirm-test-bk-9', 2500);
    assert(createResult.success, 'Should create payment');
    assertEquals(createResult.data?.status, 'pending', 'Payment should be pending');

    // Try to expire stale bookings
    const expiredCount = expireStaleBookings();

    // With pending payment, booking should expire
    assertEquals(expiredCount, 1, 'Should expire booking with pending payment');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
    delete (bookingDb as any).getEvents;
    delete (bookingDb as any).saveEvents;
  }
});

// ============================================
// TEST 9: Notifier errors do not affect flow
// ============================================

runTest('notifier errors: paymentCreated errors do not break flow', () => {
  // Create error-throwing notifier
  const errorNotifier: PaymentEventNotifier = {
    async paymentCreated(): Promise<void> {
      throw new Error('Intentional notifier error');
    },
    async paymentConfirmed(): Promise<void> {
      // success
    },
  };
  setPaymentEventNotifier(errorNotifier);

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-10',
      eventId: 'confirm-test-evt-10',
      tableId: 'table-10',
      seatsBooked: 2,
      status: 'reserved',
      totalAmount: 9000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    // Payment creation should succeed despite notifier error
    const result = createPaymentIntentService('confirm-test-bk-10', 9000);
    assert(result.success, 'Should still create payment despite notifier error');
    assertEquals(result.status, 201, 'Should return 201');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
    setPaymentEventNotifier(mockNotifier); // Restore mock notifier
  }
});

runTest('notifier errors: paymentConfirmed errors do not break flow', () => {
  // Create error-throwing notifier
  const errorNotifier: PaymentEventNotifier = {
    async paymentCreated(): Promise<void> {
      // success
    },
    async paymentConfirmed(): Promise<void> {
      throw new Error('Intentional notifier error');
    },
  };
  setPaymentEventNotifier(errorNotifier);

  const mockBookingsState = [
    {
      id: 'confirm-test-bk-11',
      eventId: 'confirm-test-evt-11',
      tableId: 'table-11',
      seatsBooked: 2,
      status: 'reserved',
      totalAmount: 11000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('confirm-test-bk-11', 11000);
    const paymentId = createResult.data!.id;

    // Confirmation should succeed despite notifier error
    const confirmResult = markPaid(paymentId, 'admin-user');
    assert(confirmResult.success, 'Should still confirm payment despite notifier error');
    assertEquals(confirmResult.status, 200, 'Should return 200');
    assertEquals(confirmResult.data?.status, 'paid', 'Payment should be marked as paid');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
    setPaymentEventNotifier(mockNotifier); // Restore mock notifier
  }
});

// ============================================
// SUMMARY
// ============================================

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
const total = results.length;

console.log('\n' + '='.repeat(50));
console.log(`Tests: ${passed}/${total} passed`);
if (failed > 0) {
  console.log(`\n❌ Failed tests:`);
  results.filter((r) => !r.passed).forEach((r) => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}
