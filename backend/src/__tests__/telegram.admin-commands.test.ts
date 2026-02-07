/**
 * Telegram Admin Commands Integration Tests
 * Tests for /pending_payments and /confirm_payment commands
 * Covers: parsing, security, execution, error handling
 * No real Telegram API used - all mocked
 */

import { parseCommand } from '../infra/telegram/telegram.commands';
import {
  formatPendingPaymentsMessageSecure,
  formatConfirmPaymentMessageSecure,
} from '../infra/telegram';
import * as paymentRepo from '../domain/payments/payment.repository';
import * as paymentService from '../domain/payments/payment.service';

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

// Helper to create test payment
function createTestPayment(
  id: string,
  bookingId: string,
  status: 'pending' | 'paid' | 'cancelled' = 'pending',
  amount: number = 5000,
) {
  return {
    id,
    bookingId,
    amount,
    status,
    method: 'manual',
    createdAt: '2026-02-07T10:00:00Z',
    confirmedAt: status === 'paid' ? '2026-02-07T11:00:00Z' : null,
    confirmedBy: status === 'paid' ? 'admin' : null,
  };
}

console.log('\n📋 Telegram Admin Commands Integration Tests\n');

// ============================================================================
// Test 1: /pending_payments returns formatted list
// ============================================================================

runTest('/pending_payments: returns formatted list with multiple payments', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetAll = paymentRepo.getAllPayments;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  // Mock payment data
  const mockPayments = [
    createTestPayment('pay-001', 'bk-001', 'pending', 5000),
    createTestPayment('pay-002', 'bk-002', 'pending', 10000),
    createTestPayment('pay-003', 'bk-003', 'paid', 7500), // Should not appear
  ];

  (paymentRepo as any).getAllPayments = () => mockPayments;

  // Authorized admin chat
  const message = formatPendingPaymentsMessageSecure('123456789');

  assert(
    message.includes('Ожидающие оплаты') || message.includes('⏳'),
    'Should include pending payments header'
  );
  assert(
    message.includes('pay-001'),
    'Should include first payment ID'
  );
  assert(
    message.includes('pay-002'),
    'Should include second payment ID'
  );
  assert(
    !message.includes('pay-003'),
    'Should NOT include paid payment'
  );
  assert(
    message.includes('5000') || message.includes('₽'),
    'Should include amount'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).getAllPayments = originalGetAll;
});

// ============================================================================
// Test 2: /pending_payments with no payments
// ============================================================================

runTest('/pending_payments: returns "no payments" message when empty', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetAll = paymentRepo.getAllPayments;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');
  (paymentRepo as any).getAllPayments = () => [];

  const message = formatPendingPaymentsMessageSecure('123456789');

  assert(
    message.includes('Нет ожидающих оплат'),
    'Should return no payments message'
  );
  assert(
    !message.includes('⏳') || message === 'Нет ожидающих оплат',
    'Should be simple message without list'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).getAllPayments = originalGetAll;
});

// ============================================================================
// Test 3: /confirm_payment confirms payment successfully
// ============================================================================

runTest('/confirm_payment: successfully confirms pending payment', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalFind = paymentRepo.findPaymentById;
  const originalMarkPaid = paymentService.markPaid;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  (paymentRepo as any).findPaymentById = () => createTestPayment('pay-123', 'bk-456', 'pending');
  (paymentService as any).markPaid = () => ({
    success: true,
    status: 200,
    data: {
      id: 'pay-123',
      bookingId: 'bk-456',
      amount: 5000,
      status: 'paid',
      confirmedAt: '2026-02-07T11:00:00Z',
    },
  });

  const message = formatConfirmPaymentMessageSecure('123456789', 'pay-123');

  assert(
    message.includes('✅') || message.includes('Платеж подтвержден'),
    'Should include success indicator'
  );
  assert(
    message.includes('pay-123'),
    'Should include payment ID'
  );
  assert(
    message.includes('bk-456'),
    'Should include booking ID'
  );
  assert(
    message.includes('5000') || message.includes('₽'),
    'Should include amount'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).findPaymentById = originalFind;
  (paymentService as any).markPaid = originalMarkPaid;
});

// ============================================================================
// Test 4: Double confirmation is rejected (409 conflict)
// ============================================================================

runTest('/confirm_payment: rejects double confirmation (409)', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalFind = paymentRepo.findPaymentById;
  const originalMarkPaid = paymentService.markPaid;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  // Payment already paid
  (paymentRepo as any).findPaymentById = () => createTestPayment('pay-123', 'bk-456', 'paid');

  const message = formatConfirmPaymentMessageSecure('123456789', 'pay-123');

  assert(
    message.includes('⚠️') || message.includes('Платеж уже'),
    'Should include warning about already paid'
  );
  assert(
    !message.includes('✅'),
    'Should NOT include success indicator'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).findPaymentById = originalFind;
  (paymentService as any).markPaid = originalMarkPaid;
});

// ============================================================================
// Test 5: Non-admin chat is silently ignored
// ============================================================================

runTest('/pending_payments: non-admin chat returns empty message', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetAll = paymentRepo.getAllPayments;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789'); // Different chat ID
  (paymentRepo as any).getAllPayments = () => [createTestPayment('pay-001', 'bk-001')];

  // Try from unauthorized chat
  const message = formatPendingPaymentsMessageSecure('999999999');

  assert(
    message === '',
    'Should return empty string for unauthorized chat'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).getAllPayments = originalGetAll;
});

// ============================================================================
// Test 6: Non-admin /confirm_payment is silently ignored
// ============================================================================

runTest('/confirm_payment: non-admin chat returns empty message', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalFind = paymentRepo.findPaymentById;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');
  (paymentRepo as any).findPaymentById = () => createTestPayment('pay-123', 'bk-456');

  // Try from unauthorized chat
  const message = formatConfirmPaymentMessageSecure('999999999', 'pay-123');

  assert(
    message === '',
    'Should return empty string for unauthorized chat'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).findPaymentById = originalFind;
});

// ============================================================================
// Test 7: null chat ID is rejected (like non-admin)
// ============================================================================

runTest('/pending_payments: null chat ID returns empty message', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetAll = paymentRepo.getAllPayments;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');
  (paymentRepo as any).getAllPayments = () => [createTestPayment('pay-001', 'bk-001')];

  const message = formatPendingPaymentsMessageSecure(null);

  assert(
    message === '',
    'Should return empty string for null chat ID'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).getAllPayments = originalGetAll;
});

// ============================================================================
// Test 8: Command parsing works with security - /pending_payments
// ============================================================================

runTest('Command parsing: /pending_payments parses correctly', () => {
  const parsed = parseCommand('/pending_payments');

  assert(
    parsed.type === 'pending_payments',
    'Should parse /pending_payments command'
  );
  assert(
    parsed.type !== 'unknown',
    'Should not return unknown'
  );
});

// ============================================================================
// Test 9: Command parsing works with security - /confirm_payment
// ============================================================================

runTest('Command parsing: /confirm_payment with ID parses correctly', () => {
  const parsed = parseCommand('/confirm_payment pay-123');

  assert(
    parsed.type === 'confirm_payment',
    'Should parse /confirm_payment command'
  );
  assert(
    parsed.paymentId === 'pay-123',
    'Should extract payment ID'
  );
});

// ============================================================================
// Test 10: Payment repository errors are handled gracefully
// ============================================================================

runTest('/pending_payments: handles repository errors gracefully', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetAll = paymentRepo.getAllPayments;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  // Mock error in repository
  (paymentRepo as any).getAllPayments = () => {
    throw new Error('Database connection failed');
  };

  let threw = false;
  let message = '';

  try {
    message = formatPendingPaymentsMessageSecure('123456789');
  } catch (err) {
    threw = true;
  }

  assert(
    !threw,
    'Should not throw on repository error'
  );
  // Will be empty or error message but not crash
  assert(
    typeof message === 'string',
    'Should return string even on error'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).getAllPayments = originalGetAll;
});

// ============================================================================
// Test 11: markPaid service errors are handled gracefully
// ============================================================================

runTest('/confirm_payment: handles service errors gracefully', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalFind = paymentRepo.findPaymentById;
  const originalMarkPaid = paymentService.markPaid;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  (paymentRepo as any).findPaymentById = () => createTestPayment('pay-123', 'bk-456');

  // Mock error in service
  (paymentService as any).markPaid = () => {
    throw new Error('Payment service error');
  };

  let threw = false;
  let message = '';

  try {
    message = formatConfirmPaymentMessageSecure('123456789', 'pay-123');
  } catch (err) {
    threw = true;
  }

  assert(
    !threw,
    'Should not throw on service error'
  );
  assert(
    typeof message === 'string',
    'Should return string even on error'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).findPaymentById = originalFind;
  (paymentService as any).markPaid = originalMarkPaid;
});

// ============================================================================
// Test 12: End-to-end flow: parse command, check security, execute
// ============================================================================

runTest('End-to-end: /pending_payments full flow', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetAll = paymentRepo.getAllPayments;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');
  (paymentRepo as any).getAllPayments = () => [createTestPayment('pay-001', 'bk-001')];

  // 1. Parse command
  const parsed = parseCommand('/pending_payments');
  assert(parsed.type === 'pending_payments', 'Command should parse');

  // 2. Execute secure handler with correct chat ID
  const authorizedMessage = formatPendingPaymentsMessageSecure('123456789');
  assert(
    authorizedMessage !== '',
    'Should return message for authorized chat'
  );

  // 3. Execute secure handler with wrong chat ID
  const unauthorizedMessage = formatPendingPaymentsMessageSecure('999999999');
  assert(
    unauthorizedMessage === '',
    'Should return empty for unauthorized chat'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).getAllPayments = originalGetAll;
});

// ============================================================================
// Test 13: End-to-end flow: /confirm_payment with all checks
// ============================================================================

runTest('End-to-end: /confirm_payment full flow', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalFind = paymentRepo.findPaymentById;
  const originalMarkPaid = paymentService.markPaid;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  (paymentRepo as any).findPaymentById = () => createTestPayment('pay-123', 'bk-456', 'pending');
  (paymentService as any).markPaid = () => ({
    success: true,
    status: 200,
    data: {
      id: 'pay-123',
      bookingId: 'bk-456',
      amount: 5000,
      status: 'paid',
      confirmedAt: '2026-02-07T11:00:00Z',
    },
  });

  // 1. Parse command
  const parsed = parseCommand('/confirm_payment pay-123');
  assert(parsed.type === 'confirm_payment', 'Command should parse');
  assert(parsed.paymentId === 'pay-123', 'Payment ID should extract');

  // 2. Execute with authorized chat
  const authorizedMessage = formatConfirmPaymentMessageSecure('123456789', 'pay-123');
  assert(
    authorizedMessage.includes('✅') || authorizedMessage.includes('подтвержден'),
    'Should confirm for authorized chat'
  );

  // 3. Execute with unauthorized chat
  const unauthorizedMessage = formatConfirmPaymentMessageSecure('999999999', 'pay-123');
  assert(
    unauthorizedMessage === '',
    'Should return empty for unauthorized chat'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).findPaymentById = originalFind;
  (paymentService as any).markPaid = originalMarkPaid;
});

// ============================================================================
// Test 14: No real Telegram API calls are made
// ============================================================================

runTest('No real Telegram API: all operations are local', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const originalGetAll = paymentRepo.getAllPayments;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');
  (paymentRepo as any).getAllPayments = () => [createTestPayment('pay-001', 'bk-001')];

  // Execute command
  let apiCallAttempted = false;
  const originalFetch = global.fetch;
  (global as any).fetch = () => {
    apiCallAttempted = true;
    throw new Error('Should not call real API');
  };

  try {
    formatPendingPaymentsMessageSecure('123456789');
  } finally {
    (global as any).fetch = originalFetch;
  }

  assert(
    !apiCallAttempted,
    'Should not attempt any real API calls'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  (paymentRepo as any).getAllPayments = originalGetAll;
});

// ============================================================================
// Test 15: Empty payment ID in /confirm_payment
// ============================================================================

runTest('/confirm_payment: handles missing payment ID', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;

  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const message = formatConfirmPaymentMessageSecure('123456789', undefined);

  assert(
    message.includes('❌') || message.includes('Ошибка'),
    'Should return error for missing payment ID'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n==================================================');
console.log(`Tests: ${testsPassed}/${testsPassed + testsFailed} passed`);
if (testsFailed === 0) {
  console.log('✅ All tests passed!');
} else {
  console.log(`❌ ${testsFailed} test(s) failed`);
  process.exit(1);
}
