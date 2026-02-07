/**
 * Unit tests for payment creation event emission
 * Run with: npx ts-node src/__tests__/payment.events.test.ts
 */

import {
  createPaymentIntentService,
  setPaymentEventNotifier,
  type PaymentEventNotifier,
  type PaymentCreatedEvent,
  type PaymentConfirmedEvent,
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
// MOCK NOTIFIER
// ============================================

class MockPaymentNotifier implements PaymentEventNotifier {
  calls: Array<{ event: 'paymentCreated'; data: PaymentCreatedEvent } | { event: 'paymentConfirmed'; data: PaymentConfirmedEvent }> = [];

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
// TESTS
// ============================================

const mockNotifier = new MockPaymentNotifier();

// Set up mock notifier
setPaymentEventNotifier(mockNotifier);

// Store original getBookings
const originalGetBookings = (bookingDb as any).getBookings;

console.log('\n📋 Payment Creation Event Tests\n');

runTest('createPaymentIntent emits paymentCreated event', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'test-bk-evt-1',
      eventId: 'test-evt-1',
      tableId: 'table-1',
      seatsBooked: 2,
      status: 'confirmed',
      totalAmount: 5000,
    },
  ];

  // Mock getBookings to return our test data
  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const result = createPaymentIntentService('test-bk-evt-1', 5000);
    assert(result.success, 'Should create payment');

    assertEquals(mockNotifier.calls.length, 1, 'Should emit one event');
    assert(mockNotifier.calls[0], 'Should have first call');
    assertEquals(
      mockNotifier.calls[0]!.event,
      'paymentCreated',
      'Should emit paymentCreated',
    );
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('paymentCreated event includes bookingId', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'test-bk-evt-2',
      eventId: 'test-evt-2',
      tableId: 'table-2',
      seatsBooked: 3,
      status: 'confirmed',
      totalAmount: 7500,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    createPaymentIntentService('test-bk-evt-2', 7500);

    assert(mockNotifier.calls[0], 'Should have first call');
    assert(mockNotifier.calls[0]!.event === 'paymentCreated', 'Should emit paymentCreated');
    const event = mockNotifier.calls[0]!.data as PaymentCreatedEvent;
    assertEquals(event.bookingId, 'test-bk-evt-2', 'Should include bookingId');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('paymentCreated event includes eventId', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'test-bk-evt-3',
      eventId: 'my-event-123',
      tableId: 'table-3',
      seatsBooked: 4,
      status: 'confirmed',
      totalAmount: 10000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    createPaymentIntentService('test-bk-evt-3', 10000);

    assert(mockNotifier.calls[0], 'Should have first call');
    assert(mockNotifier.calls[0]!.event === 'paymentCreated', 'Should emit paymentCreated');
    const event = mockNotifier.calls[0]!.data as PaymentCreatedEvent;
    assertEquals(event.eventId, 'my-event-123', 'Should include eventId');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('paymentCreated event includes tableId', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'test-bk-evt-4',
      eventId: 'test-evt-4',
      tableId: 'table-vip-5',
      seatsBooked: 2,
      status: 'confirmed',
      totalAmount: 8000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    createPaymentIntentService('test-bk-evt-4', 8000);

    assert(mockNotifier.calls[0], 'Should have first call');
    assert(mockNotifier.calls[0]!.event === 'paymentCreated', 'Should emit paymentCreated');
    const event = mockNotifier.calls[0]!.data as PaymentCreatedEvent;
    assertEquals(event.tableId, 'table-vip-5', 'Should include tableId');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('paymentCreated event includes seatsBooked', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'test-bk-evt-5',
      eventId: 'test-evt-5',
      tableId: 'table-5',
      seatsBooked: 6,
      status: 'confirmed',
      totalAmount: 15000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    createPaymentIntentService('test-bk-evt-5', 15000);

    assert(mockNotifier.calls[0], 'Should have first call');
    assert(mockNotifier.calls[0]!.event === 'paymentCreated', 'Should emit paymentCreated');
    const event = mockNotifier.calls[0]!.data as PaymentCreatedEvent;
    assertEquals(event.seatsBooked, 6, 'Should include seatsBooked');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('paymentCreated event includes amount', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'test-bk-evt-6',
      eventId: 'test-evt-6',
      tableId: 'table-6',
      seatsBooked: 2,
      status: 'confirmed',
      totalAmount: 12500,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    createPaymentIntentService('test-bk-evt-6', 12500);

    assert(mockNotifier.calls[0], 'Should have first call');
    assert(mockNotifier.calls[0]!.event === 'paymentCreated', 'Should emit paymentCreated');
    const event = mockNotifier.calls[0]!.data as PaymentCreatedEvent;
    assertEquals(event.amount, 12500, 'Should include amount');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('paymentCreated event has method:manual', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'test-bk-evt-7',
      eventId: 'test-evt-7',
      tableId: 'table-7',
      seatsBooked: 1,
      status: 'confirmed',
      totalAmount: 3000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    createPaymentIntentService('test-bk-evt-7', 3000);

    assert(mockNotifier.calls[0], 'Should have first call');
    assert(mockNotifier.calls[0]!.event === 'paymentCreated', 'Should emit paymentCreated');
    const event = mockNotifier.calls[0]!.data as PaymentCreatedEvent;
    assertEquals(event.method, 'manual', 'Should have method: manual');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('paymentCreated event includes Russian instruction', () => {
  mockNotifier.reset();

  const mockBookingsState = [
    {
      id: 'test-bk-evt-8',
      eventId: 'test-evt-8',
      tableId: 'table-8',
      seatsBooked: 2,
      status: 'confirmed',
      totalAmount: 6000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    createPaymentIntentService('test-bk-evt-8', 6000);

    assert(mockNotifier.calls[0], 'Should have first call');
    assert(mockNotifier.calls[0]!.event === 'paymentCreated', 'Should emit paymentCreated');
    const event = mockNotifier.calls[0]!.data as PaymentCreatedEvent;
    assertEquals(
      event.instruction,
      'Ожидается перевод по номеру телефона',
      'Should include Russian instruction',
    );
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
  }
});

runTest('notifier errors do not break payment creation', () => {
  mockNotifier.reset();

  // Mock a notifier that throws
  const errorNotifier: PaymentEventNotifier = {
    async paymentCreated() {
      throw new Error('Intentional notifier error');
    },
    async paymentConfirmed() {
      // success
    },
  };
  setPaymentEventNotifier(errorNotifier);

  const mockBookingsState = [
    {
      id: 'test-bk-evt-9',
      eventId: 'test-evt-9',
      tableId: 'table-9',
      seatsBooked: 2,
      status: 'confirmed',
      totalAmount: 4000,
    },
  ];

  (bookingDb as any).getBookings = () => mockBookingsState;

  try {
    const result = createPaymentIntentService('test-bk-evt-9', 4000);
    
    // Payment creation should still succeed despite notifier error
    assert(result.success, 'Should still create payment despite notifier error');
    assertEquals(result.status, 201, 'Should have 201 status');
    assert(result.data, 'Should return payment data');
  } finally {
    (bookingDb as any).getBookings = originalGetBookings;
    // Restore mock notifier
    setPaymentEventNotifier(mockNotifier);
  }
});

runTest('no event emitted when booking not found', () => {
  mockNotifier.reset();

  // Try to create payment for non-existent booking
  const result = createPaymentIntentService('nonexistent-booking-id', 5000);

  // Creation should succeed
  assert(result.success, 'Should create payment');
  
  // But no event should be emitted (booking not found)
  assertEquals(mockNotifier.calls.length, 0, 'Should not emit event if booking not found');
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
