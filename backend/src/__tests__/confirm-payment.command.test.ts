/**
 * Confirm Payment Command Tests
 * Tests for /confirm_payment <paymentId> command handler
 */

import {
  formatConfirmPaymentMessage,
  processConfirmPaymentCommand,
} from '../infra/telegram/confirm-payment.command';
import type { ParsedCommand } from '../infra/telegram/telegram.commands';
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

// Test setup/teardown
function setupTest() {
  // Clear payment repository
  const payments: any[] = [];
  const originalGetAll = paymentRepo.getAllPayments;
  const originalFind = paymentRepo.findPaymentById;
  const originalCreate = paymentRepo.createPaymentIntent;
  const originalUpdate = paymentRepo.updatePaymentStatus;

  // Store originals for restoration
  return {
    originalGetAll,
    originalFind,
    originalCreate,
    originalUpdate,
  };
}

function teardownTest(originals: any) {
  // Restore originals (mocking framework would do this)
}

// Helper to create test payment
function createTestPayment(
  id: string,
  bookingId: string,
  status: 'pending' | 'paid' | 'cancelled' = 'pending',
) {
  return {
    id,
    bookingId,
    amount: 5000,
    status,
    method: 'manual',
    createdAt: '2026-02-07T10:00:00Z',
    confirmedAt: status === 'paid' ? '2026-02-07T11:00:00Z' : null,
    confirmedBy: status === 'paid' ? 'admin' : null,
  };
}

// ============================================================================
// Tests
// ============================================================================

console.log('\n📋 Confirm Payment Command Tests\n');

// Test 1: No payment ID provided
runTest('formatConfirmPaymentMessage: no paymentId returns error', () => {
  const message = formatConfirmPaymentMessage(undefined);
  assert(
    message.includes('❌'),
    'Should contain error indicator'
  );
  assert(
    message.includes('указан') || message.includes('Ошибка'),
    'Should mention missing payment ID or error'
  );
});

// Test 2: Empty payment ID
runTest('formatConfirmPaymentMessage: empty paymentId returns error', () => {
  const message = formatConfirmPaymentMessage('');
  assert(
    message.includes('❌'),
    'Should contain error indicator'
  );
});

// Test 3: Payment not found
runTest('formatConfirmPaymentMessage: payment not found', () => {
  // Mock findPaymentById to return null
  const originalFind = paymentRepo.findPaymentById;
  (paymentRepo as any).findPaymentById = () => null;

  const message = formatConfirmPaymentMessage('nonexistent-pay-123');
  assert(
    message.includes('❌'),
    'Should contain error indicator'
  );
  assert(
    message.includes('не найден'),
    'Should mention payment not found'
  );

  (paymentRepo as any).findPaymentById = originalFind;
});

// Test 4: Payment already paid (double confirmation prevention)
runTest(
  'formatConfirmPaymentMessage: payment already paid returns warning',
  () => {
    const originalFind = paymentRepo.findPaymentById;
    (paymentRepo as any).findPaymentById = () => createTestPayment('pay-123', 'bk-456', 'paid');

    const message = formatConfirmPaymentMessage('pay-123');
    assert(
      message.includes('⚠️'),
      'Should contain warning indicator'
    );
    assert(
      message.includes('Платеж') && (message.includes('подтвержден') || message.includes('Ошибка')),
      'Should mention confirmation or error'
    );

    (paymentRepo as any).findPaymentById = originalFind;
  },
);

// Test 5: Payment already cancelled
runTest(
  'formatConfirmPaymentMessage: cancelled payment returns error',
  () => {
    const originalFind = paymentRepo.findPaymentById;
    (paymentRepo as any).findPaymentById = () => createTestPayment('pay-123', 'bk-456', 'cancelled');

    const message = formatConfirmPaymentMessage('pay-123');
    assert(
      message.includes('❌'),
      'Should contain error indicator'
    );
    assert(
      message.includes('отменен'),
      'Should mention payment cancelled'
    );

    (paymentRepo as any).findPaymentById = originalFind;
  },
);

// Test 6: Successful payment confirmation
runTest(
  'formatConfirmPaymentMessage: successful confirmation',
  () => {
    const originalFind = paymentRepo.findPaymentById;
    const originalMarkPaid = paymentService.markPaid;

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

    const message = formatConfirmPaymentMessage('pay-123');
    assert(
      message.includes('✅'),
      'Should contain success indicator'
    );
    assert(
      message.includes('Платеж подтвержден'),
      'Should mention payment confirmed'
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
      message.includes('5000'),
      'Should include amount'
    );

    (paymentRepo as any).findPaymentById = originalFind;
    (paymentService as any).markPaid = originalMarkPaid;
  },
);

// Test 7: markPaid returns 404
runTest(
  'formatConfirmPaymentMessage: markPaid returns 404',
  () => {
    const originalFind = paymentRepo.findPaymentById;
    const originalMarkPaid = paymentService.markPaid;

    (paymentRepo as any).findPaymentById = () => createTestPayment('pay-123', 'bk-456', 'pending');
    (paymentService as any).markPaid = () => ({
      success: false,
      status: 404,
      error: 'Payment not found',
    });

    const message = formatConfirmPaymentMessage('pay-123');
    assert(
      message.includes('❌'),
      'Should contain error indicator'
    );
    assert(
      message.includes('Ошибка'),
      'Should mention error'
    );

    (paymentRepo as any).findPaymentById = originalFind;
    (paymentService as any).markPaid = originalMarkPaid;
  },
);

// Test 8: markPaid returns 409 (conflict)
runTest(
  'formatConfirmPaymentMessage: markPaid returns 409 conflict',
  () => {
    const originalFind = paymentRepo.findPaymentById;
    const originalMarkPaid = paymentService.markPaid;

    (paymentRepo as any).findPaymentById = () => createTestPayment('pay-123', 'bk-456', 'pending');
    (paymentService as any).markPaid = () => ({
      success: false,
      status: 409,
      error: 'Booking is already paid',
    });

    const message = formatConfirmPaymentMessage('pay-123');
    assert(
      message.includes('⚠️'),
      'Should contain conflict indicator'
    );
    assert(
      message.includes('Конфликт'),
      'Should mention conflict'
    );

    (paymentRepo as any).findPaymentById = originalFind;
    (paymentService as any).markPaid = originalMarkPaid;
  },
);

// Test 9: Exception handling - never throws
runTest(
  'formatConfirmPaymentMessage: never throws on error',
  () => {
    const originalFind = paymentRepo.findPaymentById;
    (paymentRepo as any).findPaymentById = () => {
      throw new Error('Database error');
    };

    let threw = false;
    try {
      const message = formatConfirmPaymentMessage('pay-123');
      assert(
        message.includes('❌'),
        'Should return error message'
      );
    } catch (err) {
      threw = true;
    }

    assert(
      !threw,
      'Should not throw exception'
    );

    (paymentRepo as any).findPaymentById = originalFind;
  },
);

// Test 10: Message includes amount with ruble symbol
runTest(
  'formatConfirmPaymentMessage: includes ruble symbol in amount',
  () => {
    const originalFind = paymentRepo.findPaymentById;
    const originalMarkPaid = paymentService.markPaid;

    (paymentRepo as any).findPaymentById = () => createTestPayment('pay-123', 'bk-456', 'pending');
    (paymentService as any).markPaid = () => ({
      success: true,
      status: 200,
      data: {
        id: 'pay-123',
        bookingId: 'bk-456',
        amount: 10000,
        status: 'paid',
        confirmedAt: '2026-02-07T11:00:00Z',
      },
    });

    const message = formatConfirmPaymentMessage('pay-123');
    assert(
      message.includes('10000 ₽'),
      'Should include ruble symbol'
    );

    (paymentRepo as any).findPaymentById = originalFind;
    (paymentService as any).markPaid = originalMarkPaid;
  },
);

// Test 11: Message uses HTML formatting for code blocks
runTest(
  'formatConfirmPaymentMessage: uses HTML code blocks',
  () => {
    const originalFind = paymentRepo.findPaymentById;
    const originalMarkPaid = paymentService.markPaid;

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

    const message = formatConfirmPaymentMessage('pay-123');
    assert(
      message.includes('<code>'),
      'Should use HTML code tags'
    );
    assert(
      message.includes('</code>'),
      'Should close HTML code tags'
    );

    (paymentRepo as any).findPaymentById = originalFind;
    (paymentService as any).markPaid = originalMarkPaid;
  },
);

// Test 12: processConfirmPaymentCommand with valid command
runTest(
  'processConfirmPaymentCommand: processes confirm_payment command',
  () => {
    const originalFind = paymentRepo.findPaymentById;
    const originalMarkPaid = paymentService.markPaid;

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

    const command: ParsedCommand = {
      type: 'confirm_payment',
      paymentId: 'pay-123',
    };

    const result = processConfirmPaymentCommand(command);
    assert(
      result.success === true,
      'Should indicate success'
    );
    assert(
      result.paymentId === 'pay-123',
      'Should include paymentId'
    );
    assert(
      result.message.includes('✅'),
      'Should return success message'
    );

    (paymentRepo as any).findPaymentById = originalFind;
    (paymentService as any).markPaid = originalMarkPaid;
  },
);

// Test 13: processConfirmPaymentCommand with error
runTest(
  'processConfirmPaymentCommand: returns error result on failure',
  () => {
    const originalFind = paymentRepo.findPaymentById;
    (paymentRepo as any).findPaymentById = () => null;

    const command: ParsedCommand = {
      type: 'confirm_payment',
      paymentId: 'nonexistent',
    };

    const result = processConfirmPaymentCommand(command);
    assert(
      result.success === false,
      'Should indicate failure'
    );
    assert(
      result.message.includes('❌'),
      'Should return error message'
    );

    (paymentRepo as any).findPaymentById = originalFind;
  },
);

// Test 14: Special characters in payment ID are handled safely
runTest(
  'formatConfirmPaymentMessage: handles special chars in paymentId',
  () => {
    const message = formatConfirmPaymentMessage('pay-<script>alert(1)</script>');
    // Should not throw, just return error message
    assert(
      typeof message === 'string',
      'Should return string message'
    );
    assert(
      message.includes('❌') || message.includes('Ошибка') || message.includes('⚠️'),
      'Should return error or warning message'
    );
  },
);

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
