/**
 * Unit tests for payment API endpoints
 * Run with: npx ts-node src/__tests__/payment.api.test.ts
 */

import { Request, Response } from 'express';
import { createPaymentIntentService, cancelPayment } from '../domain/payments';
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
// MOCK HTTP HELPERS
// ============================================

interface MockResponse {
  statusCode: number;
  body: any;
}

function createMockResponse(): [Response, MockResponse] {
  const mockData: MockResponse = {
    statusCode: 200,
    body: null,
  };

  const response = {
    status(code: number) {
      mockData.statusCode = code;
      return this;
    },
    json(data: any) {
      mockData.body = data;
      return this;
    },
  } as any as Response;

  return [response, mockData];
}

// ============================================
// MOCK DATABASE
// ============================================

const mockBookings: any[] = [];

const originalGetBookings = db.getBookings;
const originalUpdateBookingStatus = db.updateBookingStatus;

function setupMockBooking(status: string = 'reserved'): string {
  const bookingId = 'bk-api-test-' + Date.now();
  mockBookings.length = 0;
  mockBookings.push({
    id: bookingId,
    eventId: 'evt-test',
    status,
    totalAmount: 1000,
  });
  return bookingId;
}

(db as any).getBookings = () => Promise.resolve(mockBookings);

let bookingUpdateCalls: Array<{ bookingId: string; status: string }> = [];

(db as any).updateBookingStatus = (bookingId: string, status: string) => {
  bookingUpdateCalls.push({ bookingId, status });
  const booking = mockBookings.find((b) => b.id === bookingId);
  if (booking) {
    booking.status = status;
  }
  return Promise.resolve(booking);
};

// ============================================
// SIMULATED ENDPOINT LOGIC
// ============================================

async function handleCreatePayment(req: Request, res: Response): Promise<any> {
  const { bookingId, amount } = req.body || {};

  if (!bookingId || !amount) {
    return res.status(400).json({ error: 'bookingId and amount are required' });
  }

  const bookings = await db.getBookings();
  const booking = bookings.find((b: any) => b.id === bookingId);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.status !== 'reserved') {
    return res.status(400).json({
      error: 'Booking must be reserved to create a payment intent',
    });
  }

  const result = await createPaymentIntentService(bookingId, amount);
  if (!result.success) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.data);
}

function handleMarkPaid(req: Request, res: Response): any {
  const paymentId = String(req.params.id);

  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  return res.status(409).json({
    error: 'Payment confirmation is only allowed via POST /admin/bookings/:id/confirm',
  });
}

function handleCancelPayment(req: Request, res: Response): any {
  const paymentId = String(req.params.id);

  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  const result = cancelPayment(paymentId);
  if (!result.success) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.data);
}

// ============================================
// TEST SUITE
// ============================================

async function runTests(): Promise<void> {
  console.log('\n📋 Payment API Endpoint Tests\n');

  // Test 1: POST /public/payments with valid booking
  await runTest('POST /public/payments creates payment for reserved booking', async () => {
    const bookingId = setupMockBooking('reserved');
    const [res, mockRes] = createMockResponse();
    const req = { body: { bookingId, amount: 1000 } } as Request;

    await handleCreatePayment(req, res);

    assertEquals(mockRes.statusCode, 201, 'Should return 201');
    assert(mockRes.body.id, 'Should have payment id');
    assertEquals(mockRes.body.status, 'pending', 'Should be pending');
  });

  // Test 2: POST /public/payments with non-existent booking
  await runTest('POST /public/payments returns 404 for missing booking', async () => {
    const [res, mockRes] = createMockResponse();
    const req = { body: { bookingId: 'nonexistent', amount: 1000 } } as Request;

    await handleCreatePayment(req, res);

    assertEquals(mockRes.statusCode, 404, 'Should return 404');
    assert(mockRes.body.error, 'Should have error');
  });

  // Test 3: POST /public/payments with non-reserved booking
  await runTest('POST /public/payments returns 400 for non-reserved booking', async () => {
    const bookingId = setupMockBooking('paid');
    const [res, mockRes] = createMockResponse();
    const req = { body: { bookingId, amount: 1000 } } as Request;

    await handleCreatePayment(req, res);

    assertEquals(mockRes.statusCode, 400, 'Should return 400');
  });

  // Test 4: POST /public/payments/:id/pay is not allowed
  await runTest('POST /public/payments/:id/pay returns 409', async () => {
    const bookingId = setupMockBooking();
    const createReq = { body: { bookingId, amount: 1000 } } as Request;
    const [createRes, createMockRes] = createMockResponse();

    await handleCreatePayment(createReq, createRes);
    const paymentId = createMockRes.body.id;

    // Now pay with confirmedBy
    const [payRes, payMockRes] = createMockResponse();
    const payReq = { params: { id: paymentId }, body: { confirmedBy: 'admin-user' } } as any as Request;

    handleMarkPaid(payReq, payRes);

    assertEquals(payMockRes.statusCode, 409, 'Should return 409');
    assert(payMockRes.body.error, 'Should return error');
  });

  // Test 5: POST /public/payments/:id/pay repeated calls return 409
  await runTest('POST /public/payments/:id/pay repeated calls return 409', async () => {
    const bookingId = setupMockBooking();
    const createReq = { body: { bookingId, amount: 1000 } } as Request;
    const [createRes, createMockRes] = createMockResponse();

    await handleCreatePayment(createReq, createRes);
    const paymentId = createMockRes.body.id;

    // First pay
    const [payRes1, payMockRes1] = createMockResponse();
    const payReq1 = { params: { id: paymentId }, body: { confirmedBy: 'admin-user' } } as any as Request;
    handleMarkPaid(payReq1, payRes1);
    assertEquals(payMockRes1.statusCode, 409, 'First pay should return 409');

    // Second pay
    const [payRes2, payMockRes2] = createMockResponse();
    const payReq2 = { params: { id: paymentId } } as any as Request;
    handleMarkPaid(payReq2, payRes2);
    assertEquals(payMockRes2.statusCode, 409, 'Second pay should return 409');
  });

  // Test 6: POST /public/payments/:id/cancel cancels payment
  await runTest('POST /public/payments/:id/cancel cancels payment', async () => {
    const bookingId = setupMockBooking();
    const createReq = { body: { bookingId, amount: 1000 } } as Request;
    const [createRes, createMockRes] = createMockResponse();

    await handleCreatePayment(createReq, createRes);
    const paymentId = createMockRes.body.id;

    // Cancel
    const [cancelRes, cancelMockRes] = createMockResponse();
    const cancelReq = { params: { id: paymentId } } as any as Request;

    handleCancelPayment(cancelReq, cancelRes);

    assertEquals(cancelMockRes.statusCode, 200, 'Should return 200');
    assertEquals(cancelMockRes.body.status, 'cancelled', 'Should be cancelled');
  });

  // Test 7: Cannot pay cancelled payment
  await runTest('Cannot pay cancelled payment (returns 409)', async () => {
    const bookingId = setupMockBooking();
    const createReq = { body: { bookingId, amount: 1000 } } as Request;
    const [createRes, createMockRes] = createMockResponse();

    await handleCreatePayment(createReq, createRes);
    const paymentId = createMockRes.body.id;

    // Cancel
    const [cancelRes, _] = createMockResponse();
    const cancelReq = { params: { id: paymentId } } as any as Request;
    handleCancelPayment(cancelReq, cancelRes);

    // Try to pay
    const [payRes, payMockRes] = createMockResponse();
    const payReq = { params: { id: paymentId }, body: { confirmedBy: 'admin-user' } } as any as Request;
    handleMarkPaid(payReq, payRes);

    assertEquals(payMockRes.statusCode, 409, 'Should return 409');
  });

  // Test 8: Paid payment updates booking status
  await runTest('Paid payment updates related booking status', async () => {
    const bookingId = setupMockBooking();
    const createReq = { body: { bookingId, amount: 1000 } } as Request;
    const [createRes, createMockRes] = createMockResponse();

    await handleCreatePayment(createReq, createRes);
    const paymentId = createMockRes.body.id;

    bookingUpdateCalls = [];

    // Pay
    const [payRes, payMockRes] = createMockResponse();
    const payReq = { params: { id: paymentId }, body: { confirmedBy: 'admin-user' } } as any as Request;
    handleMarkPaid(payReq, payRes);

    assertEquals(payMockRes.statusCode, 200, 'Should succeed');
    const updateCall = bookingUpdateCalls.find((c) => c.bookingId === bookingId);
    assert(updateCall !== undefined, 'Should update booking');
    assertEquals(updateCall!.status, 'paid', 'Booking should be paid');
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
