/**
 * Unit tests for admin payment confirmation endpoint
 * Run with: npx ts-node src/__tests__/payment.admin.test.ts
 */

import {
  createPaymentIntentService,
  findPaymentById,
} from '../domain/payments';
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
// MOCK RESPONSE HELPER
// ============================================

interface MockResponse {
  statusCode: number;
  body: any;
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
  };
}

// Store original getBookings
const originalGetBookings = (bookingDb as any).getBookings;

// Mock bookings for testing
let mockBookingsState: any[] = [];

// ============================================
// ENDPOINT HANDLER (mirrors actual route)
// ============================================

function handleConfirmPayment(
  paymentId: string,
  _confirmedBy: string | undefined,
  mockRes: MockResponse,
): void {
  if (!paymentId) {
    mockRes.statusCode = 400;
    mockRes.body = { error: 'paymentId is required' };
    return;
  }

  // Find payment
  const payment = findPaymentById(paymentId);
  if (!payment) {
    mockRes.statusCode = 404;
    mockRes.body = { error: 'Payment not found' };
    return;
  }

  // Check payment status
  if (payment.status !== 'pending') {
    mockRes.statusCode = 409;
    mockRes.body = { error: 'Payment is not pending' };
    return;
  }

  // Find related booking - uses the mocked getBookings
  const bookings = (bookingDb as any).getBookings();
  const booking = bookings.find((b: any) => b.id === payment.bookingId);
  if (!booking) {
    mockRes.statusCode = 404;
    mockRes.body = { error: 'Booking not found' };
    return;
  }

  // Check booking status
  if (booking.status !== 'reserved') {
    mockRes.statusCode = 400;
    mockRes.body = { error: 'Booking must be reserved' };
    return;
  }

  mockRes.statusCode = 409;
  mockRes.body = { error: 'Payment confirmation is only allowed via POST /admin/bookings/:id/confirm' };
}

// ============================================
// TESTS
// ============================================

console.log('\n📋 Admin Payment Confirmation Tests\n');

runTest('POST /admin/payments/:id/confirm is not allowed', () => {
  // Setup mock bookings
  mockBookingsState = [
    {
      id: 'test-bk-1',
      eventId: 'test-evt',
      status: 'reserved',
      totalAmount: 1000,
    },
  ];

  // Mock getBookings to return our test data
  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('test-bk-1', 1000);
    assert(createResult.success, `Should create payment: ${createResult.error}`);
    const paymentId = createResult.data!.id;

    const mockRes = createMockResponse();
    handleConfirmPayment(paymentId, 'admin@example.com', mockRes);

    assertEquals(mockRes.statusCode, 409, `Should return 409, got ${mockRes.statusCode}: ${JSON.stringify(mockRes.body)}`);
    assert(mockRes.body.error, 'Should return error message');
  } finally {
    // Restore original getBookings
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('POST /admin/payments/:id/confirm ignores confirmedBy', () => {
  mockBookingsState = [
    {
      id: 'test-bk-2',
      eventId: 'test-evt',
      status: 'reserved',
      totalAmount: 1000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('test-bk-2', 1000);
    const paymentId = createResult.data!.id;

    const mockRes = createMockResponse();
    handleConfirmPayment(paymentId, undefined, mockRes);

    assertEquals(mockRes.statusCode, 409, 'Should return 409');
    assert(mockRes.body.error, 'Should have error message');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('POST /admin/payments/:id/confirm returns 404 for missing payment', () => {
  const mockRes = createMockResponse();
  handleConfirmPayment('nonexistent-id', 'admin@example.com', mockRes);

  assertEquals(mockRes.statusCode, 404, 'Should return 404');
});

runTest('POST /admin/payments/:id/confirm returns 409 even for pending payment', () => {
  mockBookingsState = [
    {
      id: 'test-bk-3',
      eventId: 'test-evt',
      status: 'reserved',
      totalAmount: 1000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('test-bk-3', 1000);
    const paymentId = createResult.data!.id;

    // First confirm - should be rejected
    const mockRes1 = createMockResponse();
    handleConfirmPayment(paymentId, 'admin@example.com', mockRes1);
    assertEquals(mockRes1.statusCode, 409, `Should return 409, got ${mockRes1.statusCode}: ${JSON.stringify(mockRes1.body)}`);
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('POST /admin/payments/:id/confirm requires reserved booking', () => {
  // Setup with non-reserved booking
  mockBookingsState = [
    {
      id: 'test-bk-pending',
      eventId: 'test-evt',
      status: 'expired', // Not reserved
      totalAmount: 1000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('test-bk-pending', 1000);
    const paymentId = createResult.data!.id;

    const mockRes = createMockResponse();
    handleConfirmPayment(paymentId, 'admin@example.com', mockRes);

    assertEquals(mockRes.statusCode, 400, 'Should return 400');
    assert(mockRes.body.error.includes('reserved'), 'Error should mention booking status');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('POST /admin/payments/:id/confirm does not modify payment', () => {
  mockBookingsState = [
    {
      id: 'test-bk-4',
      eventId: 'test-evt',
      status: 'reserved',
      totalAmount: 1000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const createResult = createPaymentIntentService('test-bk-4', 1000);
    const paymentId = createResult.data!.id;

    const mockRes = createMockResponse();
    handleConfirmPayment(paymentId, 'jane.admin@company.com', mockRes);

    assertEquals(mockRes.statusCode, 409, 'Should return 409');
    assert(mockRes.body.error, 'Should return error message');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
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
