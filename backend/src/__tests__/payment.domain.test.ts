/**
 * Unit tests for payment domain
 * Run with: npx ts-node src/__tests__/payment.domain.test.ts
 */

import {
  createPaymentIntentService,
  markPaid,
  cancelPayment,
  type ServiceResponse,
  type PaymentIntent,
} from '../domain/payments';
import * as paymentRepo from '../domain/payments/payment.repository';
import { db } from '../db';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  fn: () => Promise<void> | void,
): Promise<void> {
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
// MOCK SETUP
// ============================================

// Mock getBookings to return test booking
const mockBookings: any[] = [];

const originalGetBookings = db.getBookings;
const originalUpdateBookingStatus = db.updateBookingStatus;

function setupMockBooking(): string {
  const bookingId = 'bk-test-' + Date.now();
  mockBookings.length = 0;
  mockBookings.push({
    id: bookingId,
    eventId: 'evt-test',
    status: 'reserved',
    totalAmount: 1000,
  });
  return bookingId;
}

function setupPaidBooking(): string {
  const bookingId = 'bk-paid-' + Date.now();
  mockBookings.length = 0;
  mockBookings.push({
    id: bookingId,
    eventId: 'evt-test',
    status: 'paid',
    totalAmount: 1000,
  });
  return bookingId;
}

// Monkey-patch getBookings
(db as any).getBookings = () => Promise.resolve(mockBookings);

let bookingUpdateCalls: Array<{ bookingId: string; status: string }> = [];

// Monkey-patch updateBookingStatus to track calls
(db as any).updateBookingStatus = (bookingId: string, status: string) => {
  bookingUpdateCalls.push({ bookingId, status });
  const booking = mockBookings.find((b) => b.id === bookingId);
  if (booking) {
    booking.status = status;
  }
  return Promise.resolve(booking);
};

// ============================================
// TEST SUITE
// ============================================

async function runTests(): Promise<void> {
  console.log('\n📋 Payment Domain Tests\n');

  // Test 1: Create payment intent -> pending
  await runTest('createPaymentIntent creates payment with pending status', async () => {
    const bookingId = setupMockBooking();
    const result = await createPaymentIntentService(bookingId, 1000);

    assert(result.success, 'Should succeed');
    assertEquals(result.status, 201, 'Should return 201');
    assert(result.data !== undefined, 'Should have data');
    assertEquals(result.data!.status, 'pending', 'Status should be pending');
    assertEquals(result.data!.bookingId, bookingId, 'Should link to booking');
    assertEquals(result.data!.amount, 1000, 'Amount should match');
  });

  // Test 2: Create payment with invalid input
  await runTest('createPaymentIntent rejects invalid input', async () => {
    const result = await createPaymentIntentService('', 0);
    assert(!result.success, 'Should fail');
    assertEquals(result.status, 400, 'Should return 400');
  });

  // Test 3: Pay payment -> status updated to paid with confirmation
  await runTest('markPaid transitions payment to paid', async () => {
    const bookingId = setupMockBooking();
    const createResult = await createPaymentIntentService(bookingId, 1000);
    assert(createResult.data !== undefined, 'Should create payment');

    const paymentId = createResult.data!.id;
    const payResult = await markPaid(paymentId, 'admin-user');

    assert(payResult.success, 'Should succeed');
    assertEquals(payResult.status, 200, 'Should return 200');
    assertEquals(payResult.data!.status, 'paid', 'Status should be paid');
    assertEquals(payResult.data!.confirmedBy, 'admin-user', 'Should have confirmedBy');
    assert(payResult.data!.confirmedAt !== null, 'Should have confirmedAt timestamp');
    assertEquals(payResult.data!.method, 'manual', 'Should have method: manual');
  });

  // Test 4: markPaid requires confirmedBy
  await runTest('markPaid rejects missing confirmedBy', async () => {
    const bookingId = setupMockBooking();
    const createResult = await createPaymentIntentService(bookingId, 1000);
    const paymentId = createResult.data!.id;

    // Try to pay without confirmedBy (empty string)
    const payResult = await markPaid(paymentId, '');
    assert(!payResult.success, 'Should fail without confirmedBy');
    assertEquals(payResult.status, 400, 'Should return 400');
  });

  // Test 5: Double pay -> 409
  await runTest('markPaid twice returns 409', async () => {
    const bookingId = setupMockBooking();
    const createResult = await createPaymentIntentService(bookingId, 1000);
    const paymentId = createResult.data!.id;

    // First pay - should succeed
    const payResult1 = await markPaid(paymentId, 'admin-user');
    assert(payResult1.success, 'First pay should succeed');

    // Second pay - should fail with 409
    const payResult2 = await markPaid(paymentId, 'admin-user');
    assert(!payResult2.success, 'Second pay should fail');
    assertEquals(payResult2.status, 409, 'Should return 409 Conflict');
  });

  // Test 6: Cancel payment -> cancelled
  await runTest('cancelPayment transitions payment to cancelled', async () => {
    const bookingId = setupMockBooking();
    const createResult = await createPaymentIntentService(bookingId, 1000);
    const paymentId = createResult.data!.id;

    const cancelResult = cancelPayment(paymentId);
    assert(cancelResult.success, 'Should succeed');
    assertEquals(cancelResult.status, 200, 'Should return 200');
    assertEquals(cancelResult.data!.status, 'cancelled', 'Status should be cancelled');
  });

  // Test 7: Pay cancelled -> 409
  await runTest('markPaid on cancelled payment returns 409', async () => {
    const bookingId = setupMockBooking();
    const createResult = await createPaymentIntentService(bookingId, 1000);
    const paymentId = createResult.data!.id;

    // Cancel first
    cancelPayment(paymentId);

    // Try to pay - should fail
    const payResult = await markPaid(paymentId, 'admin-user');
    assert(!payResult.success, 'Should fail');
    assertEquals(payResult.status, 409, 'Should return 409');
  });

  // Test 8: Double cancel -> 409
  await runTest('cancelPayment twice returns 409', async () => {
    const bookingId = setupMockBooking();
    const createResult = await createPaymentIntentService(bookingId, 1000);
    const paymentId = createResult.data!.id;

    // First cancel - should succeed
    const cancelResult1 = cancelPayment(paymentId);
    assert(cancelResult1.success, 'First cancel should succeed');

    // Second cancel - should fail with 409
    const cancelResult2 = cancelPayment(paymentId);
    assert(!cancelResult2.success, 'Second cancel should fail');
    assertEquals(cancelResult2.status, 409, 'Should return 409');
  });

  // Test 9: Pay payment -> booking status updated to paid
  await runTest('markPaid updates related booking status to paid', async () => {
    const bookingId = setupMockBooking();
    const createResult = await createPaymentIntentService(bookingId, 1000);
    const paymentId = createResult.data!.id;

    bookingUpdateCalls = [];

    const payResult = await markPaid(paymentId, 'admin-user');
    assert(payResult.success, 'Should succeed');

    // Verify booking was updated
    const updateCall = bookingUpdateCalls.find((c) => c.bookingId === bookingId);
    assert(updateCall !== undefined, 'Should update booking');
    assertEquals(updateCall!.status, 'paid', 'Booking status should be updated to paid');
  });

  // Test 10: Cannot pay if booking is already paid
  await runTest('markPaid fails if booking is already paid', async () => {
    const bookingId = setupPaidBooking();
    const createResult = await createPaymentIntentService(bookingId, 1000);
    const paymentId = createResult.data!.id;

    const payResult = await markPaid(paymentId, 'admin-user');
    assert(!payResult.success, 'Should fail');
    assertEquals(payResult.status, 409, 'Should return 409');
  });

  // Test 11: Cancel payment does not change booking status
  await runTest('cancelPayment does not update booking status', async () => {
    const bookingId = setupMockBooking();
    const createResult = await createPaymentIntentService(bookingId, 1000);
    const paymentId = createResult.data!.id;

    bookingUpdateCalls = [];

    const cancelResult = cancelPayment(paymentId);
    assert(cancelResult.success, 'Should succeed');

    // Verify no booking update call
    const updateCall = bookingUpdateCalls.find((c) => c.bookingId === bookingId);
    assert(!updateCall, 'Should NOT update booking on cancel');

    // Booking should remain reserved
    const booking = mockBookings.find((b) => b.id === bookingId);
    assertEquals(booking.status, 'reserved', 'Booking should remain reserved');
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
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
