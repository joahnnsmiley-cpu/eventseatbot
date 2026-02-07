/**
 * Unit tests for Telegram command parsing
 * Run with: npx ts-node src/__tests__/telegram.commands.test.ts
 */

import { parseCommand, isKnownCommand, shouldProcessCommand, type ParsedCommand } from '../infra/telegram/telegram.commands';

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

console.log('\n📋 Telegram Command Parser Tests\n');

// ============================================
// TEST 1: /pending_payments command
// ============================================

runTest('parseCommand: /pending_payments returns correct type', () => {
  const parsed = parseCommand('/pending_payments');
  assertEquals(parsed.type, 'pending_payments', 'Should parse /pending_payments');
  assert(!parsed.paymentId, 'Should not have paymentId');
});

runTest('parseCommand: /pending_payments with extra spaces', () => {
  const parsed = parseCommand('  /pending_payments  ');
  assertEquals(parsed.type, 'pending_payments', 'Should trim and parse');
});

runTest('parseCommand: /pending_payments case insensitive', () => {
  const parsed1 = parseCommand('/PENDING_PAYMENTS');
  assertEquals(parsed1.type, 'pending_payments', 'Should handle uppercase');

  const parsed2 = parseCommand('/Pending_Payments');
  assertEquals(parsed2.type, 'pending_payments', 'Should handle mixed case');
});

// ============================================
// TEST 2: /confirm_payment <paymentId> command
// ============================================

runTest('parseCommand: /confirm_payment with paymentId', () => {
  const parsed = parseCommand('/confirm_payment pay-123');
  assertEquals(parsed.type, 'confirm_payment', 'Should parse /confirm_payment');
  assertEquals(parsed.paymentId, 'pay-123', 'Should extract paymentId');
});

runTest('parseCommand: /confirm_payment with complex paymentId', () => {
  const parsed = parseCommand('/confirm_payment test-bk-evt-10-uuid-style-id');
  assertEquals(parsed.type, 'confirm_payment', 'Should parse command');
  assertEquals(parsed.paymentId, 'test-bk-evt-10-uuid-style-id', 'Should extract complex ID');
});

runTest('parseCommand: /confirm_payment with extra spaces', () => {
  const parsed = parseCommand('  /confirm_payment   payment-xyz  ');
  assertEquals(parsed.type, 'confirm_payment', 'Should trim and parse');
  assertEquals(parsed.paymentId, 'payment-xyz', 'Should extract paymentId');
});

runTest('parseCommand: /confirm_payment case insensitive', () => {
  const parsed = parseCommand('/CONFIRM_PAYMENT pay-456');
  assertEquals(parsed.type, 'confirm_payment', 'Should handle uppercase');
  assertEquals(parsed.paymentId, 'pay-456', 'Should extract paymentId');
});

runTest('parseCommand: /confirm_payment without paymentId returns unknown', () => {
  const parsed = parseCommand('/confirm_payment');
  assertEquals(parsed.type, 'unknown', 'Should return unknown when missing paymentId');
  assert(!parsed.paymentId, 'Should not have paymentId');
});

// ============================================
// TEST 3: Unknown/invalid commands
// ============================================

runTest('parseCommand: unknown command starting with /', () => {
  const parsed = parseCommand('/unknown_command');
  assertEquals(parsed.type, 'unknown', 'Should return unknown for unrecognized command');
});

runTest('parseCommand: text without / is unknown', () => {
  const parsed = parseCommand('pending_payments');
  assertEquals(parsed.type, 'unknown', 'Should return unknown for non-command text');
});

runTest('parseCommand: regular text is unknown', () => {
  const parsed = parseCommand('hello world');
  assertEquals(parsed.type, 'unknown', 'Should return unknown for regular text');
});

// ============================================
// TEST 4: Empty/null/undefined inputs
// ============================================

runTest('parseCommand: null input returns empty', () => {
  const parsed = parseCommand(null as any);
  assertEquals(parsed.type, 'empty', 'Should return empty for null');
});

runTest('parseCommand: undefined input returns empty', () => {
  const parsed = parseCommand(undefined);
  assertEquals(parsed.type, 'empty', 'Should return empty for undefined');
});

runTest('parseCommand: empty string returns empty', () => {
  const parsed = parseCommand('');
  assertEquals(parsed.type, 'empty', 'Should return empty for empty string');
});

runTest('parseCommand: whitespace only returns empty', () => {
  const parsed = parseCommand('   ');
  assertEquals(parsed.type, 'empty', 'Should return empty for whitespace only');
});

// ============================================
// TEST 5: Error handling - never throws
// ============================================

runTest('parseCommand: handles non-string input gracefully', () => {
  const parsed = parseCommand(123 as any);
  assertEquals(parsed.type, 'empty', 'Should not throw on non-string input');
});

runTest('parseCommand: handles object input gracefully', () => {
  const parsed = parseCommand({} as any);
  assertEquals(parsed.type, 'empty', 'Should not throw on object input');
});

runTest('parseCommand: handles array input gracefully', () => {
  const parsed = parseCommand(['test'] as any);
  assertEquals(parsed.type, 'empty', 'Should not throw on array input');
});

// ============================================
// TEST 6: Helper functions
// ============================================

runTest('isKnownCommand: returns true for pending_payments', () => {
  const parsed = parseCommand('/pending_payments');
  assert(isKnownCommand(parsed), 'Should return true for known command');
});

runTest('isKnownCommand: returns true for confirm_payment', () => {
  const parsed = parseCommand('/confirm_payment pay-123');
  assert(isKnownCommand(parsed), 'Should return true for known command');
});

runTest('isKnownCommand: returns false for unknown', () => {
  const parsed = parseCommand('/unknown');
  assert(!isKnownCommand(parsed), 'Should return false for unknown command');
});

runTest('isKnownCommand: returns false for empty', () => {
  const parsed = parseCommand('');
  assert(!isKnownCommand(parsed), 'Should return false for empty');
});

runTest('shouldProcessCommand: returns true for known commands', () => {
  const parsed1 = parseCommand('/pending_payments');
  assert(shouldProcessCommand(parsed1), 'Should return true for pending_payments');

  const parsed2 = parseCommand('/confirm_payment pay-123');
  assert(shouldProcessCommand(parsed2), 'Should return true for confirm_payment');
});

runTest('shouldProcessCommand: returns true for unknown (to log)', () => {
  const parsed = parseCommand('/unknown');
  assert(shouldProcessCommand(parsed), 'Should return true for unknown (for logging)');
});

runTest('shouldProcessCommand: returns false only for empty', () => {
  const parsed = parseCommand('');
  assert(!shouldProcessCommand(parsed), 'Should return false for empty');
});

// ============================================
// TEST 7: Edge cases
// ============================================

runTest('parseCommand: command with extra arguments takes only first arg', () => {
  const parsed = parseCommand('/confirm_payment pay-123 extra arg');
  assertEquals(parsed.type, 'confirm_payment', 'Should parse command');
  assertEquals(parsed.paymentId, 'pay-123', 'Should take only first argument');
});

runTest('parseCommand: / alone returns unknown', () => {
  const parsed = parseCommand('/');
  assertEquals(parsed.type, 'unknown', 'Should return unknown for / alone');
});

runTest('parseCommand: command with newlines', () => {
  const parsed = parseCommand('/pending_payments\n');
  assertEquals(parsed.type, 'pending_payments', 'Should handle command with newline');
});

runTest('parseCommand: command with tabs', () => {
  const parsed = parseCommand('\t/pending_payments\t');
  assertEquals(parsed.type, 'pending_payments', 'Should handle command with tabs');
});

// ============================================
// TEST 8: /booking_status command
// ============================================

runTest('parseCommand: /booking_status with bookingId', () => {
  const parsed = parseCommand('/booking_status bk-123');
  assertEquals(parsed.type, 'booking_status', 'Should parse /booking_status');
  assertEquals(parsed.bookingId, 'bk-123', 'Should extract bookingId');
});

runTest('parseCommand: /booking_status with complex bookingId', () => {
  const parsed = parseCommand('/booking_status booking_evt-2026-001');
  assertEquals(parsed.type, 'booking_status', 'Should parse command');
  assertEquals(parsed.bookingId, 'booking_evt-2026-001', 'Should handle complex ID');
});

runTest('parseCommand: /booking_status with extra spaces', () => {
  const parsed = parseCommand('  /booking_status  bk-456  ');
  assertEquals(parsed.type, 'booking_status', 'Should trim and parse');
  assertEquals(parsed.bookingId, 'bk-456', 'Should extract bookingId');
});

runTest('parseCommand: /booking_status with uppercase', () => {
  const parsed = parseCommand('/BOOKING_STATUS bk-789');
  assertEquals(parsed.type, 'booking_status', 'Should handle uppercase');
  assertEquals(parsed.bookingId, 'bk-789', 'Should extract bookingId');
});

runTest('parseCommand: /booking_status without bookingId returns unknown', () => {
  const parsed = parseCommand('/booking_status');
  assertEquals(parsed.type, 'unknown', 'Should return unknown without bookingId');
});

runTest('parseCommand: /booking_status with empty bookingId returns unknown', () => {
  const parsed = parseCommand('/booking_status  ');
  assertEquals(parsed.type, 'unknown', 'Should return unknown with empty bookingId');
});

runTest('parseCommand: /booking_status with multiple args takes first', () => {
  const parsed = parseCommand('/booking_status bk-123 extra args');
  assertEquals(parsed.type, 'booking_status', 'Should parse command');
  assertEquals(parsed.bookingId, 'bk-123', 'Should take only first argument');
});

// ============================================
// TEST 9: isKnownCommand for all types
// ============================================

runTest('isKnownCommand: returns true for booking_status', () => {
  const parsed = parseCommand('/booking_status bk-123');
  assert(isKnownCommand(parsed), 'Should return true for booking_status command');
});

runTest('isKnownCommand: returns false for unknown', () => {
  const parsed = parseCommand('/unknown_command');
  assert(!isKnownCommand(parsed), 'Should return false for unknown');
});

runTest('isKnownCommand: returns false for empty', () => {
  const parsed = parseCommand('');
  assert(!isKnownCommand(parsed), 'Should return false for empty');
});


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
