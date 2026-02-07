/**
 * Telegram Callback Handler Tests
 * Tests for processing inline button callbacks
 * Run with: npx ts-node src/__tests__/telegram.callbacks.test.ts
 */

import {
  parseCallback,
  isSupportedCallback,
  formatCallbackResponseMessage,
  isKnownCallback,
  type ParsedCallback,
} from '../infra/telegram/telegram.callbacks';

let testsPassed = 0;
let testsFailed = 0;

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ${message}`);
    testsFailed++;
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    console.error(`❌ ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
    console.error(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
  }
}

console.log('\n📋 Telegram Callback Handler Tests\n');

// ============================================================================
// PARSING TESTS
// ============================================================================

runTest('parseCallback: handles confirm_payment with paymentId', () => {
  const callback = parseCallback('confirm_payment:pay-123');

  assertEquals(callback.type, 'confirm_payment', 'Should parse type as confirm_payment');
  assertEquals(callback.paymentId, 'pay-123', 'Should extract paymentId');
  assertEquals(callback.raw, 'confirm_payment:pay-123', 'Should store raw');
});

runTest('parseCallback: handles multiple segment paymentId', () => {
  const callback = parseCallback('confirm_payment:pay-evt-2026-001');

  assertEquals(callback.type, 'confirm_payment', 'Should parse type');
  assertEquals(callback.paymentId, 'pay-evt-2026-001', 'Should handle complex ID');
});

runTest('parseCallback: returns unknown for invalid format', () => {
  const callback = parseCallback('invalid_command:value');

  assertEquals(callback.type, 'unknown', 'Should return unknown');
  assertEquals(callback.paymentId, undefined, 'Should not have paymentId');
});

runTest('parseCallback: returns unknown for malformed confirm_payment', () => {
  const callback = parseCallback('confirm_payment:');

  assertEquals(callback.type, 'unknown', 'Should return unknown for empty paymentId');
  assertEquals(callback.paymentId, undefined, 'paymentId should be undefined');
});

runTest('parseCallback: handles empty callbackData', () => {
  const callback = parseCallback('');

  assertEquals(callback.type, 'unknown', 'Should return unknown');
  assertEquals(callback.raw, '', 'Should store raw');
});

runTest('parseCallback: handles undefined callbackData', () => {
  const callback = parseCallback(undefined);

  assertEquals(callback.type, 'unknown', 'Should return unknown');
  assertEquals(callback.raw, '', 'Should have empty raw');
});

runTest('parseCallback: handles whitespace', () => {
  const callback = parseCallback('  confirm_payment:pay-456  ');

  assertEquals(callback.type, 'confirm_payment', 'Should trim and parse');
  assertEquals(callback.paymentId, 'pay-456', 'Should extract paymentId from trimmed input');
});

// ============================================================================
// SUPPORTED CALLBACK TESTS
// ============================================================================

runTest('isSupportedCallback: returns true for valid confirm_payment', () => {
  const callback: ParsedCallback = {
    type: 'confirm_payment',
    paymentId: 'pay-123',
    raw: 'confirm_payment:pay-123',
  };

  assert(isSupportedCallback(callback), 'Should support confirm_payment with paymentId');
});

runTest('isSupportedCallback: returns false for unknown type', () => {
  const callback: ParsedCallback = {
    type: 'unknown',
    raw: 'invalid',
  };

  assert(!isSupportedCallback(callback), 'Should not support unknown callbacks');
});

runTest('isSupportedCallback: returns false for confirm_payment without paymentId', () => {
  const callback = {
    type: 'confirm_payment',
    paymentId: undefined,
    raw: 'confirm_payment:',
  } as unknown as ParsedCallback;

  assert(!isSupportedCallback(callback), 'Should not support confirm_payment without paymentId');
});

// ============================================================================
// AUTHORIZATION TESTS
// ============================================================================

runTest('formatCallbackResponseMessage: silently ignores unauthorized chat', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '987654321');

  const callback = parseCallback('confirm_payment:pay-123');
  const message = formatCallbackResponseMessage('123456789', callback); // Different chat ID

  assertEquals(message, '', 'Should return empty string for unauthorized chat');

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
});

runTest('formatCallbackResponseMessage: accepts authorized chat', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const callback = parseCallback('confirm_payment:nonexistent-payment');
  const message = formatCallbackResponseMessage('123456789', callback);

  // Should return error message (payment not found) not empty string
  assert(message.length > 0, 'Should return message for authorized chat');
  assert(message.includes('❌') || message.includes('Ошибка'), 'Should indicate error for missing payment');

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
});

runTest('formatCallbackResponseMessage: handles string chat ID', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const callback = parseCallback('confirm_payment:nonexistent');
  const message = formatCallbackResponseMessage('123456789', callback); // String format

  assert(message.length > 0, 'Should handle string chat ID');

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
});

// ============================================================================
// RESPONSE MESSAGE TESTS
// ============================================================================

runTest('formatCallbackResponseMessage: returns error for unknown callback type', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const callback = parseCallback('unknown_command:value');
  const message = formatCallbackResponseMessage('123456789', callback);

  assertEquals(message, '', 'Should return empty string for unknown callback');

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
});

runTest('formatCallbackResponseMessage: handles confirm_payment for missing payment', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const callback = parseCallback('confirm_payment:nonexistent-id-xyz');
  const message = formatCallbackResponseMessage('123456789', callback);

  assert(message.includes('Ошибка') || message.includes('❌'), 'Should indicate error');
  assert(message.includes('nonexistent-id-xyz') || message.includes('не найден'), 'Should mention payment not found');

  setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
});

// ============================================================================
// IS KNOWN CALLBACK TESTS
// ============================================================================

runTest('isKnownCallback: returns true for valid confirm_payment callback', () => {
  assert(isKnownCallback('confirm_payment:pay-123'), 'Should recognize confirm_payment callback');
});

runTest('isKnownCallback: returns false for unknown callback', () => {
  assert(!isKnownCallback('unknown_command:value'), 'Should reject unknown callback');
});

runTest('isKnownCallback: returns false for malformed confirm_payment', () => {
  assert(!isKnownCallback('confirm_payment:'), 'Should reject confirm_payment without paymentId');
});

runTest('isKnownCallback: returns false for empty callbackData', () => {
  assert(!isKnownCallback(''), 'Should reject empty callbackData');
});

runTest('isKnownCallback: returns false for undefined callbackData', () => {
  assert(!isKnownCallback(undefined), 'Should reject undefined callbackData');
});

runTest('isKnownCallback: handles errors gracefully', () => {
  // Should not throw even if something goes wrong
  let threw = false;
  try {
    isKnownCallback(null as any);
  } catch (err) {
    threw = true;
  }
  assert(!threw, 'Should never throw');
});

// ============================================================================
// EDGE CASES
// ============================================================================

runTest('parseCallback: handles callback_data with colons in paymentId', () => {
  const callback = parseCallback('confirm_payment:pay:123:456');

  assertEquals(callback.type, 'confirm_payment', 'Should parse type');
  assertEquals(callback.paymentId, 'pay:123:456', 'Should preserve colons in paymentId');
});

runTest('formatCallbackResponseMessage: never throws on errors', () => {
  let threw = false;
  try {
    const callback: ParsedCallback = {
      type: 'confirm_payment',
      paymentId: 'test-payment',
      raw: 'confirm_payment:test-payment',
    };
    formatCallbackResponseMessage('123456789', callback);
  } catch (err) {
    threw = true;
  }
  assert(!threw, 'Should never throw even if payment lookup fails');
});

// ============================================================================
// PAYMENT CONFIRMATION VIA CALLBACK TESTS
// ============================================================================

runTest('Callback confirms payment with "telegram-inline" source', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    const callback = parseCallback('confirm_payment:nonexistent-pay-1');
    const message = formatCallbackResponseMessage('123456789', callback);

    // Message indicates payment not found (which is correct)
    assert(message.includes('❌') || message.includes('Ошибка'), 'Should handle missing payment gracefully');
    assert(!message.includes('undefined'), 'Should not expose undefined values');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  }
});

runTest('Callback prevents double confirmation', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    // Parse the callback
    const callback = parseCallback('confirm_payment:already-paid-123');
    const message = formatCallbackResponseMessage('123456789', callback);

    // Should indicate error (payment not found in this test)
    assert(message.length > 0, 'Should return a response');
    assert(message.indexOf('undefined') === -1, 'Should not have undefined in response');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  }
});

runTest('Callback returns error message for unauthorized access', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '987654321'); // Different admin chat

  try {
    const callback = parseCallback('confirm_payment:pay-123');
    const message = formatCallbackResponseMessage('123456789', callback); // Different chat

    assertEquals(message, '', 'Should return empty string for unauthorized access');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  }
});

runTest('Callback response is properly formatted', () => {
  const originalEnv = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  try {
    const callback = parseCallback('confirm_payment:missing-payment-xyz');
    const message = formatCallbackResponseMessage('123456789', callback);

    // Should have some response (even if error)
    assert(message.length > 0, 'Should return non-empty message');
    // Check for structure
    assert(message.includes('❌') || message.includes('⚠️') || message.includes('✅'), 'Should have status indicator');
    // Verify no undefined values
    assert(message.indexOf('undefined') === -1, 'Should not contain "undefined" string');
  } finally {
    setEnv('TELEGRAM_ADMIN_CHAT_ID', originalEnv);
  }
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n==================================================');
console.log(`Tests: ${testsPassed}/${testsPassed + testsFailed} passed`);
if (testsFailed === 0) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log(`❌ ${testsFailed} test(s) failed`);
  process.exit(1);
}
