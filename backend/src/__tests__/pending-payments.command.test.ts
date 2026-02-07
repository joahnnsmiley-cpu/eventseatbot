/**
 * Unit tests for /pending_payments command
 * Run with: npx ts-node src/__tests__/pending-payments.command.test.ts
 */

import { formatPendingPaymentsMessage, getPendingPayments } from '../infra/telegram/pending-payments.command';
import * as paymentRepo from '../domain/payments/payment.repository';

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

console.log('\n📋 Pending Payments Command Tests\n');

// Store original getAllPayments
const originalGetAllPayments = paymentRepo.getAllPayments;

// Helper to mock payments
function mockPayments(payments: any[]): void {
  (paymentRepo as any).getAllPayments = () => payments;
}

function restorePayments(): void {
  (paymentRepo as any).getAllPayments = originalGetAllPayments;
}

// ============================================
// TEST 1: No pending payments
// ============================================

runTest('formatPendingPaymentsMessage: returns Russian message when no pending payments', () => {
  mockPayments([]);

  try {
    const message = formatPendingPaymentsMessage();
    assertEquals(message, 'Нет ожидающих оплат', 'Should return Russian message');
  } finally {
    restorePayments();
  }
});

runTest('getPendingPayments: returns empty array when no pending payments', () => {
  mockPayments([]);

  try {
    const payments = getPendingPayments();
    assertEquals(payments.length, 0, 'Should return empty array');
  } finally {
    restorePayments();
  }
});

// ============================================
// TEST 2: Single pending payment
// ============================================

runTest('formatPendingPaymentsMessage: includes paymentId', () => {
  const testPayments = [
    {
      id: 'pay-123',
      bookingId: 'bk-456',
      amount: 5000,
      status: 'pending',
      createdAt: Date.now(),
    },
  ];

  mockPayments(testPayments);

  try {
    const message = formatPendingPaymentsMessage();
    assert(message.includes('pay-123'), 'Should include paymentId');
    assert(message.includes('<code>pay-123</code>'), 'Should be in code format');
  } finally {
    restorePayments();
  }
});

runTest('formatPendingPaymentsMessage: includes bookingId', () => {
  const testPayments = [
    {
      id: 'pay-123',
      bookingId: 'bk-456',
      amount: 5000,
      status: 'pending',
      createdAt: Date.now(),
    },
  ];

  mockPayments(testPayments);

  try {
    const message = formatPendingPaymentsMessage();
    assert(message.includes('bk-456'), 'Should include bookingId');
    assert(message.includes('<code>bk-456</code>'), 'Should be in code format');
  } finally {
    restorePayments();
  }
});

runTest('formatPendingPaymentsMessage: includes amount', () => {
  const testPayments = [
    {
      id: 'pay-123',
      bookingId: 'bk-456',
      amount: 5000,
      status: 'pending',
      createdAt: Date.now(),
    },
  ];

  mockPayments(testPayments);

  try {
    const message = formatPendingPaymentsMessage();
    assert(message.includes('5000'), 'Should include amount');
    assert(message.includes('5000 ₽'), 'Should include currency symbol');
  } finally {
    restorePayments();
  }
});

runTest('formatPendingPaymentsMessage: includes creation date', () => {
  const now = Date.now();
  const testPayments = [
    {
      id: 'pay-123',
      bookingId: 'bk-456',
      amount: 5000,
      status: 'pending',
      createdAt: now,
    },
  ];

  mockPayments(testPayments);

  try {
    const message = formatPendingPaymentsMessage();
    assert(message.includes('Created:'), 'Should include Created label');
    // Should include date in some form
    assert(message.length > 100, 'Should be a substantial message');
  } finally {
    restorePayments();
  }
});

// ============================================
// TEST 3: Multiple pending payments
// ============================================

runTest('formatPendingPaymentsMessage: includes all pending payments', () => {
  const testPayments = [
    {
      id: 'pay-1',
      bookingId: 'bk-1',
      amount: 1000,
      status: 'pending',
      createdAt: Date.now() - 10000,
    },
    {
      id: 'pay-2',
      bookingId: 'bk-2',
      amount: 2000,
      status: 'pending',
      createdAt: Date.now(),
    },
    {
      id: 'pay-3',
      bookingId: 'bk-3',
      amount: 3000,
      status: 'pending',
      createdAt: Date.now() - 5000,
    },
  ];

  mockPayments(testPayments);

  try {
    const message = formatPendingPaymentsMessage();
    assert(message.includes('pay-1'), 'Should include pay-1');
    assert(message.includes('pay-2'), 'Should include pay-2');
    assert(message.includes('pay-3'), 'Should include pay-3');
  } finally {
    restorePayments();
  }
});

runTest('formatPendingPaymentsMessage: includes total count', () => {
  const testPayments = [
    {
      id: 'pay-1',
      bookingId: 'bk-1',
      amount: 1000,
      status: 'pending',
      createdAt: Date.now(),
    },
    {
      id: 'pay-2',
      bookingId: 'bk-2',
      amount: 2000,
      status: 'pending',
      createdAt: Date.now(),
    },
  ];

  mockPayments(testPayments);

  try {
    const message = formatPendingPaymentsMessage();
    assert(message.includes('Total: 2'), 'Should include count of 2');
  } finally {
    restorePayments();
  }
});

// ============================================
// TEST 4: Filters out non-pending payments
// ============================================

runTest('formatPendingPaymentsMessage: only includes pending status payments', () => {
  const testPayments = [
    {
      id: 'pay-1',
      bookingId: 'bk-1',
      amount: 1000,
      status: 'pending',
      createdAt: Date.now(),
    },
    {
      id: 'pay-2',
      bookingId: 'bk-2',
      amount: 2000,
      status: 'paid',
      createdAt: Date.now(),
    },
    {
      id: 'pay-3',
      bookingId: 'bk-3',
      amount: 3000,
      status: 'cancelled',
      createdAt: Date.now(),
    },
  ];

  mockPayments(testPayments);

  try {
    const message = formatPendingPaymentsMessage();
    assert(message.includes('pay-1'), 'Should include pending payment');
    assert(!message.includes('pay-2'), 'Should not include paid payment');
    assert(!message.includes('pay-3'), 'Should not include cancelled payment');
    assert(message.includes('Total: 1'), 'Should count only 1 pending');
  } finally {
    restorePayments();
  }
});

// ============================================
// TEST 5: getPendingPayments data structure
// ============================================

runTest('getPendingPayments: returns correct data structure', () => {
  const testPayments = [
    {
      id: 'pay-123',
      bookingId: 'bk-456',
      amount: 5000,
      status: 'pending',
      createdAt: Date.now(),
    },
  ];

  mockPayments(testPayments);

  try {
    const payments = getPendingPayments();
    assert(payments.length === 1, 'Should return 1 payment');

    const payment = payments[0]!;
    assert(payment.paymentId === 'pay-123', 'Should have paymentId');
    assert(payment.bookingId === 'bk-456', 'Should have bookingId');
    assertEquals(payment.amount, 5000, 'Should have amount');
    assert(typeof payment.createdAt === 'string', 'createdAt should be ISO string');
  } finally {
    restorePayments();
  }
});

// ============================================
// TEST 6: Error handling - never throws
// ============================================

runTest('formatPendingPaymentsMessage: never throws on error', () => {
  // Mock getAllPayments to throw
  (paymentRepo as any).getAllPayments = () => {
    throw new Error('Database error');
  };

  try {
    const message = formatPendingPaymentsMessage();
    assert(typeof message === 'string', 'Should return a string even on error');
    assert(message.includes('Error'), 'Should return error message');
  } finally {
    restorePayments();
  }
});

runTest('getPendingPayments: never throws on error', () => {
  // Mock getAllPayments to throw
  (paymentRepo as any).getAllPayments = () => {
    throw new Error('Database error');
  };

  try {
    const payments = getPendingPayments();
    assertEquals(payments.length, 0, 'Should return empty array on error');
  } finally {
    restorePayments();
  }
});

// ============================================
// TEST 7: Date formatting
// ============================================

runTest('formatPendingPaymentsMessage: formats dates correctly', () => {
  const testDate = new Date('2026-02-07T14:30:00Z');
  const testPayments = [
    {
      id: 'pay-123',
      bookingId: 'bk-456',
      amount: 5000,
      status: 'pending',
      createdAt: testDate.getTime(),
    },
  ];

  mockPayments(testPayments);

  try {
    const message = formatPendingPaymentsMessage();
    // Check for date pattern (DD.MM.YYYY HH:MM format)
    assert(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/.test(message), 'Should include formatted date');
  } finally {
    restorePayments();
  }
});

// ============================================
// TEST 8: Message formatting
// ============================================

runTest('formatPendingPaymentsMessage: uses HTML formatting', () => {
  const testPayments = [
    {
      id: 'pay-123',
      bookingId: 'bk-456',
      amount: 5000,
      status: 'pending',
      createdAt: Date.now(),
    },
  ];

  mockPayments(testPayments);

  try {
    const message = formatPendingPaymentsMessage();
    assert(message.includes('<b>'), 'Should use bold formatting');
    assert(message.includes('<code>'), 'Should use code formatting');
    assert(message.includes('<i>'), 'Should use italic formatting');
  } finally {
    restorePayments();
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
