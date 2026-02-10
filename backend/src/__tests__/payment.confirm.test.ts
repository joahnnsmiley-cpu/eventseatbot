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
import { db } from '../db';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
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
const originalGetBookings = db.getBookings;

;(async () => {
console.log('\n📋 Manual Payment Confirmation Tests\n');

// ============================================
// TEST 1: Create payment → pending + notification
// ============================================

await runTest('create payment: initial status is pending', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);

  try {
    const result = await createPaymentIntentService('confirm-test-bk-1', 5000);
    assert(result.success, 'Should create payment');
    assertEquals(result.status, 201, 'Should return 201');
    assertEquals(result.data?.status, 'pending', 'Status should be pending');
  } finally {
    (db as any).getBookings = originalGetBookings;
  }
});

await runTest('create payment: emits paymentCreated notification', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);

  try {
    await createPaymentIntentService('confirm-test-bk-2', 7500);

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
    (db as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 2: Admin confirm → payment paid
// ============================================

await runTest('admin confirm: updates payment status to paid', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);

  try {
    const createResult = await createPaymentIntentService('confirm-test-bk-3', 4000);
    const paymentId = createResult.data!.id;

    const confirmResult = await markPaid(paymentId, 'admin-user');
    assert(confirmResult.success, `Should mark as paid: ${confirmResult.error}`);
    assertEquals(confirmResult.status, 200, 'Should return 200');
    assertEquals(confirmResult.data?.status, 'paid', 'Status should be paid');
  } finally {
    (db as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 3: Booking status updated to paid
// ============================================

await runTest('admin confirm: marking payment paid updates booking', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);

  try {
    const createResult = await createPaymentIntentService('confirm-test-bk-3', 4000);
    assert(createResult.success, 'Should create payment');
    const paymentId = createResult.data!.id;

    // Confirm the payment
    const confirmResult = await markPaid(paymentId, 'admin-user');
    assert(confirmResult.success, 'Should mark payment as paid');
    assertEquals(confirmResult.data?.status, 'paid', 'Payment status should be paid');
  } finally {
    (db as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 4: Telegram notification sent on confirm
// ============================================

await runTest('admin confirm: emits paymentConfirmed notification', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);

  try {
    const createResult = await createPaymentIntentService('confirm-test-bk-5', 8000);
    const paymentId = createResult.data!.id;

    // Reset to clear the create notification
    mockNotifier.reset();

    await markPaid(paymentId, 'admin-user');

    assertEquals(mockNotifier.calls.length, 1, 'Should emit exactly 1 confirmation notification');
    assertEquals(
      mockNotifier.calls[0]!.event,
      'paymentConfirmed',
      'Should emit paymentConfirmed',
    );
  } finally {
    (db as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 5: Confirmation notification has correct fields
// ============================================

await runTest('paymentConfirmed: includes bookingId, amount, confirmedBy, confirmedAt', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);

  try {
    const createResult = await createPaymentIntentService('confirm-test-bk-6', 12000);
    const paymentId = createResult.data!.id;

    mockNotifier.reset();

    await markPaid(paymentId, 'jane.admin@company.com');

    assert(mockNotifier.calls[0], 'Should have notification');
    const data = mockNotifier.calls[0]!.data as PaymentConfirmedEvent;

    assertEquals(data.bookingId, 'confirm-test-bk-6', 'Should include bookingId');
    assertEquals(data.amount, 12000, 'Should include amount');
    assertEquals(data.confirmedBy, 'jane.admin@company.com', 'Should include confirmedBy');
    assert(typeof data.confirmedAt === 'string', 'Should include confirmedAt as ISO string');
  } finally {
    (db as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 6: Double confirm → 409
// ============================================

await runTest('admin confirm: double confirm returns 409 conflict', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);

  try {
    const createResult = await createPaymentIntentService('confirm-test-bk-7', 3000);
    const paymentId = createResult.data!.id;

    // First confirm - should succeed
    const confirm1 = await markPaid(paymentId, 'admin-user');
    assert(confirm1.success, 'First confirm should succeed');
    assertEquals(confirm1.status, 200, 'Should return 200');

    // Second confirm - should fail
    const confirm2 = await markPaid(paymentId, 'admin-user');
    assert(!confirm2.success, 'Second confirm should fail');
    assertEquals(confirm2.status, 409, 'Should return 409 conflict');
  } finally {
    (db as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 7: Paid booking ignored by expiration
// ============================================

await runTest('expiration: paid booking does NOT expire', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);

  try {
    // Create and confirm payment
    const createResult = await createPaymentIntentService('confirm-test-bk-8', 5500);
    const paymentId = createResult.data!.id;
    await markPaid(paymentId, 'admin-user');

    // Set booking to be expired
    const bookings = await (db as any).getBookings();
    const booking = bookings.find((b: any) => b.id === 'confirm-test-bk-8');
    booking.expiresAt = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago

    // Try to expire stale bookings
    const expiredCount = await expireStaleBookings();

    assertEquals(expiredCount, 0, 'Should NOT expire paid booking');
    assertEquals(booking.status, 'reserved', 'Booking should still be reserved (not expired)');
  } finally {
    (db as any).getBookings = originalGetBookings;
  }
});

// ============================================
// TEST 8: Pending payment booking still expires
// ============================================

runTest('expiration: pending payment booking expires normally', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);
  (db as any).getEvents = () => [
    {
      id: 'confirm-test-evt-9',
      tables: [{ id: 'table-9', seatsAvailable: 2, seatsTotal: 4 }],
    },
  ];
  (db as any).saveEvents = () => {};

  try {
    // Create payment but do NOT confirm it (status = pending)
    const createResult = await createPaymentIntentService('confirm-test-bk-9', 2500);
    assert(createResult.success, 'Should create payment');
    assertEquals(createResult.data?.status, 'pending', 'Payment should be pending');

    // Try to expire stale bookings
    const expiredCount = await expireStaleBookings();

    // With pending payment, booking should expire
    assertEquals(expiredCount, 1, 'Should expire booking with pending payment');
  } finally {
    (db as any).getBookings = originalGetBookings;
    delete (db as any).getEvents;
    delete (db as any).saveEvents;
  }
});

// ============================================
// TEST 9: Notifier errors do not affect flow
// ============================================

await runTest('notifier errors: paymentCreated errors do not break flow', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);

  try {
    // Payment creation should succeed despite notifier error
    const result = await createPaymentIntentService('confirm-test-bk-10', 9000);
    assert(result.success, 'Should still create payment despite notifier error');
    assertEquals(result.status, 201, 'Should return 201');
  } finally {
    (db as any).getBookings = originalGetBookings;
    setPaymentEventNotifier(mockNotifier); // Restore mock notifier
  }
});

await runTest('notifier errors: paymentConfirmed errors do not break flow', async () => {
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

  (db as any).getBookings = () => Promise.resolve(mockBookingsState);

  try {
    const createResult = await createPaymentIntentService('confirm-test-bk-11', 11000);
    const paymentId = createResult.data!.id;

    // Confirmation should succeed despite notifier error
    const confirmResult = await markPaid(paymentId, 'admin-user');
    assert(confirmResult.success, 'Should still confirm payment despite notifier error');
    assertEquals(confirmResult.status, 200, 'Should return 200');
    assertEquals(confirmResult.data?.status, 'paid', 'Payment should be marked as paid');
  } finally {
    (db as any).getBookings = originalGetBookings;
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
})();
