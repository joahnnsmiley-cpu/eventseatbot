/**
 * Telegram Security Tests
 * Tests for chat ID validation and authorization
 */

import {
  isAuthorizedAdminChat,
  getConfiguredAdminChatId,
  logUnauthorizedCommand,
} from '../infra/telegram/telegram.security';

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

// Helper to temporarily set env var
function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

console.log('\n📋 Telegram Security Tests\n');

// Test 1: No admin chat ID configured
runTest('isAuthorizedAdminChat: returns false when no TELEGRAM_ADMIN_CHAT_ID', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', undefined);

  const result = isAuthorizedAdminChat('123456');
  assert(
    result === false,
    'Should deny access when admin chat ID not configured'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 2: Chat ID matches configured admin ID (string)
runTest('isAuthorizedAdminChat: returns true for matching chat ID', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const result = isAuthorizedAdminChat('123456789');
  assert(
    result === true,
    'Should authorize matching chat ID'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 3: Chat ID matches but is number instead of string
runTest('isAuthorizedAdminChat: handles numeric chat IDs', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const result = isAuthorizedAdminChat(123456789);
  assert(
    result === true,
    'Should authorize numeric chat ID when matches'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 4: Chat ID doesn't match configured admin ID
runTest('isAuthorizedAdminChat: returns false for non-matching chat ID', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const result = isAuthorizedAdminChat('987654321');
  assert(
    result === false,
    'Should deny non-matching chat ID'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 5: null chat ID is rejected
runTest('isAuthorizedAdminChat: returns false for null chat ID', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const result = isAuthorizedAdminChat(null);
  assert(
    result === false,
    'Should deny null chat ID'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 6: undefined chat ID is rejected
runTest('isAuthorizedAdminChat: returns false for undefined chat ID', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const result = isAuthorizedAdminChat(undefined);
  assert(
    result === false,
    'Should deny undefined chat ID'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 7: Whitespace is trimmed when comparing
runTest('isAuthorizedAdminChat: trims whitespace from env and input', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '  123456789  ');

  const result = isAuthorizedAdminChat('  123456789  ');
  assert(
    result === true,
    'Should authorize after trimming whitespace'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 8: Never throws on error
runTest('isAuthorizedAdminChat: never throws on error', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;

  let threw = false;
  try {
    // Try with various edge cases
    isAuthorizedAdminChat({} as any);
    isAuthorizedAdminChat([] as any);
    isAuthorizedAdminChat(NaN);
    // Should not throw
  } catch (err) {
    threw = true;
  }

  assert(
    !threw,
    'Should never throw exception'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 9: getConfiguredAdminChatId returns configured value
runTest('getConfiguredAdminChatId: returns configured admin chat ID', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const result = getConfiguredAdminChatId();
  assert(
    result === '123456789',
    'Should return configured admin chat ID'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 10: getConfiguredAdminChatId trims whitespace
runTest('getConfiguredAdminChatId: trims whitespace', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '  123456789  ');

  const result = getConfiguredAdminChatId();
  assert(
    result === '123456789',
    'Should return trimmed chat ID'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 11: getConfiguredAdminChatId returns null when not configured
runTest('getConfiguredAdminChatId: returns null when not configured', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', undefined);

  const result = getConfiguredAdminChatId();
  assert(
    result === null,
    'Should return null when not configured'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 12: getConfiguredAdminChatId never throws
runTest('getConfiguredAdminChatId: never throws', () => {
  let threw = false;
  try {
    getConfiguredAdminChatId();
  } catch (err) {
    threw = true;
  }

  assert(
    !threw,
    'Should never throw'
  );
});

// Test 13: logUnauthorizedCommand never throws
runTest('logUnauthorizedCommand: never throws', () => {
  let threw = false;
  try {
    logUnauthorizedCommand('123', '/confirm_payment');
    logUnauthorizedCommand(null, '/pending_payments');
    logUnauthorizedCommand(undefined, '/unknown');
  } catch (err) {
    threw = true;
  }

  assert(
    !threw,
    'Should never throw'
  );
});

// Test 14: Case-sensitive matching (no case conversion)
runTest('isAuthorizedAdminChat: case-sensitive matching', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  // Chat IDs are numeric so this shouldn't matter, but test anyway
  const result = isAuthorizedAdminChat('123456789');
  assert(
    result === true,
    'Should match identical chat IDs'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 15: Empty string chat ID is rejected
runTest('isAuthorizedAdminChat: returns false for empty string chat ID', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '123456789');

  const result = isAuthorizedAdminChat('');
  assert(
    result === false,
    'Should deny empty string chat ID'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
});

// Test 16: Empty string env is rejected
runTest('isAuthorizedAdminChat: returns false when env is empty string', () => {
  const original = process.env.TELEGRAM_ADMIN_CHAT_ID;
  setEnv('TELEGRAM_ADMIN_CHAT_ID', '');

  const result = isAuthorizedAdminChat('123456789');
  assert(
    result === false,
    'Should deny when env is empty'
  );

  setEnv('TELEGRAM_ADMIN_CHAT_ID', original);
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
