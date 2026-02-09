/**
 * Integration Tests: Inline Payment Confirmation
 * Tests the complete flow from payment creation through callback confirmation
 * Run with: npx ts-node src/__tests__/telegram.inline-payment-confirmation.test.ts
 */

import {
  createPaymentIntentService,
  findPaymentById,
  type PaymentIntent,
} from '../domain/payments';
import { setPaymentEventNotifier, type PaymentEventNotifier, type PaymentCreatedEvent } from '../domain/payments/payment.events';
import { TelegramPaymentNotifier } from '../infra/telegram/telegram.payment-notifier';
import { parseCallback, formatCallbackResponseMessage } from '../infra/telegram/telegram.callbacks';
import * as bookingDb from '../db';

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

// ============================================================================
// MOCK TELEGRAM CLIENT
// ============================================================================

interface MockTelegramCall {
  method: 'sendMessage' | 'sendMessageWithInlineKeyboard';
  text: string;
  keyboard?: any;
  timestamp: number;
}

const mockTelegramCalls: MockTelegramCall[] = [];

// Mock fetch to intercept Telegram API calls
const originalFetch = (global as any).fetch;
(global as any).fetch = async (url: string, options?: RequestInit) => {
  const body = options?.body ? JSON.parse(options.body as string) : {};
  
  if (body.reply_markup?.inline_keyboard) {
    mockTelegramCalls.push({
      method: 'sendMessageWithInlineKeyboard',
      text: body.text,
      keyboard: body.reply_markup.inline_keyboard,
      timestamp: Date.now(),
    });
  } else if (body.text) {
    mockTelegramCalls.push({
      method: 'sendMessage',
      text: body.text,
      timestamp: Date.now(),
    });
  }

  return { ok: true, statusText: 'OK' } as Response;
};

// ============================================================================
// SETUP
// ============================================================================

const originalGetBookings = (bookingDb as any).getBookings;
let mockBookingsState: any[] = [];

function setupPaymentNotifier() {
  const originalEnv = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_ADMIN_CHAT_ID = '123456789';

  const notifier = new TelegramPaymentNotifier();
  setPaymentEventNotifier(notifier);

  return { originalEnv: originalEnv || '', originalChatId: originalChatId || '' };
}

function resetMocks() {
  mockTelegramCalls.length = 0;
  mockBookingsState = [];
  (bookingDb as any).getBookings = () => mockBookingsState;
}

function cleanupNotifier(env: { originalEnv: string; originalChatId: string }) {
  setEnv('TELEGRAM_BOT_TOKEN', env.originalEnv || undefined);
  setEnv('TELEGRAM_ADMIN_CHAT_ID', env.originalChatId || undefined);
  (bookingDb as any).getBookings = originalGetBookings;
}

console.log('\n📋 Inline Payment Confirmation Integration Tests\n');

// ============================================================================
// TEST 1: Payment Created Message Contains Inline Button
// ============================================================================

runTest('paymentCreated message includes inline button for confirmation', () => {
  const env = setupPaymentNotifier();
  resetMocks();

  try {
    // Setup mock booking
    mockBookingsState = [
      {
        id: 'inline-test-bk-1',
        eventId: 'inline-test-evt-1',
        tableId: 'table-1',
        seatsBooked: 2,
        status: 'reserved',
        totalAmount: 5000,
      },
    ];

    // Create payment
    const result = createPaymentIntentService('inline-test-bk-1', 5000);
    assert(result.success, 'Should create payment');
    const paymentId = result.data!.id;

    // Check that Telegram notifier sent message with keyboard
    assert(mockTelegramCalls.length > 0, 'Should call Telegram API');
    const call = mockTelegramCalls[0]!;
    assert(call.method === 'sendMessageWithInlineKeyboard', 'Should use inline keyboard method');
    assert(call.keyboard, 'Should have keyboard');
    assert(call.keyboard!.length > 0, 'Should have at least one row');
    assert(call.keyboard![0]!.length > 0, 'Should have at least one button');

    // Verify button properties
    const button = call.keyboard![0]![0];
    assert(button.text === '✅ Подтвердить оплату', 'Button text should match');
    assertEquals(button.callback_data, `confirm_payment:${paymentId}`, 'Callback data should include paymentId');
  } finally {
    cleanupNotifier(env);
  }
});

// ============================================================================
// TEST 2: Callback Confirms Payment
// ============================================================================

runTest('Callback successfully confirms pending payment', () => {
  const env = setupPaymentNotifier();
  resetMocks();

  try {
    // Setup mock booking
    mockBookingsState = [
      {
        id: 'inline-test-bk-2',
        eventId: 'inline-test-evt-2',
        tableId: 'table-2',
        seatsBooked: 3,
        status: 'reserved',
        totalAmount: 7500,
      },
    ];

    // Create payment
    const createResult = createPaymentIntentService('inline-test-bk-2', 7500);
    const paymentId = createResult.data!.id;

    // Reset mock to capture callback response
    mockTelegramCalls.length = 0;

    // Simulate callback from inline button
    const callback = parseCallback(`confirm_payment:${paymentId}`);
    const response = formatCallbackResponseMessage('123456789', callback);

    // Verify payment was confirmed
    const payment = findPaymentById(paymentId);
    assertEquals(payment?.status, 'paid', 'Payment should be marked as paid');
    assertEquals(payment?.confirmedBy, 'telegram-inline', 'Should track confirmation source');
    assert(!!payment?.confirmedAt, 'Should have confirmation timestamp');

    // Verify response message
    assert(response.includes('✅'), 'Response should indicate success');
    assert(response.includes(paymentId), 'Response should include payment ID');
  } finally {
    cleanupNotifier(env);
  }
});

// ============================================================================
// TEST 3: Double Callback Rejected
// ============================================================================

runTest('Second callback for same payment is rejected (double confirm prevention)', () => {
  const env = setupPaymentNotifier();
  resetMocks();

  try {
    // Setup mock booking
    mockBookingsState = [
      {
        id: 'inline-test-bk-3',
        eventId: 'inline-test-evt-3',
        tableId: 'table-3',
        seatsBooked: 1,
        status: 'reserved',
        totalAmount: 3000,
      },
    ];

    // Create payment
    const createResult = createPaymentIntentService('inline-test-bk-3', 3000);
    const paymentId = createResult.data!.id;

    // First callback - should succeed
    const callback1 = parseCallback(`confirm_payment:${paymentId}`);
    const response1 = formatCallbackResponseMessage('123456789', callback1);
    assert(response1.includes('✅'), 'First confirmation should succeed');

    // Second callback - should fail
    const callback2 = parseCallback(`confirm_payment:${paymentId}`);
    const response2 = formatCallbackResponseMessage('123456789', callback2);
    assert(response2.includes('⚠️') || response2.includes('уже подтвержден'), 'Second confirmation should be rejected');

    // Verify payment status
    const payment = findPaymentById(paymentId);
    assertEquals(payment?.status, 'paid', 'Payment should still be paid');
  } finally {
    cleanupNotifier(env);
  }
});

// ============================================================================
// TEST 4: Unauthorized Callback Ignored
// ============================================================================

runTest('Callback from unauthorized chat is silently ignored', () => {
  // Setup notifier with one admin chat ID
  const env = setupPaymentNotifier(); // Sets admin chat to '123456789'
  resetMocks();

  try {
    // Setup mock booking
    mockBookingsState = [
      {
        id: 'inline-test-bk-4',
        eventId: 'inline-test-evt-4',
        tableId: 'table-4',
        seatsBooked: 2,
        status: 'reserved',
        totalAmount: 6000,
      },
    ];

    // Create payment
    const createResult = createPaymentIntentService('inline-test-bk-4', 6000);
    const paymentId = createResult.data!.id;

    // Verify payment is pending
    let payment = findPaymentById(paymentId);
    assertEquals(payment?.status, 'pending', 'Payment should be pending');

    // Callback from different chat ID (not the admin chat)
    const callback = parseCallback(`confirm_payment:${paymentId}`);
    const response = formatCallbackResponseMessage('999999999', callback); // Different chat ID

    // Response should be empty (silent rejection)
    assertEquals(response, '', 'Unauthorized callback should return empty response');

    // Payment should still be pending
    payment = findPaymentById(paymentId);
    assertEquals(payment?.status, 'pending', 'Payment should still be pending after unauthorized callback');
  } finally {
    cleanupNotifier(env);
  }
});

// ============================================================================
// TEST 5: Notifier Errors Do Not Break Flow
// ============================================================================

runTest('Notifier errors do not prevent payment creation', () => {
  // Setup notifier that throws errors
  const errorNotifier: PaymentEventNotifier = {
    async paymentCreated() {
      throw new Error('Telegram notifier error');
    },
    async paymentConfirmed() {
      throw new Error('Telegram notifier error');
    },
  };

  setPaymentEventNotifier(errorNotifier);
  resetMocks();

  try {
    // Setup mock booking
    mockBookingsState = [
      {
        id: 'inline-test-bk-5',
        eventId: 'inline-test-evt-5',
        tableId: 'table-5',
        seatsBooked: 4,
        status: 'reserved',
        totalAmount: 10000,
      },
    ];

    // Create payment should succeed despite notifier error
    const result = createPaymentIntentService('inline-test-bk-5', 10000);
    assert(result.success, 'Payment creation should succeed despite notifier error');
    assertEquals(result.status, 201, 'Should return 201 status');
    assert(!!result.data?.id, 'Should have payment ID');
  } finally {
    const env = setupPaymentNotifier();
    cleanupNotifier(env);
  }
});

// ============================================================================
// TEST 6: No Real Telegram API Calls
// ============================================================================

runTest('All Telegram communication is mocked (no real API calls)', () => {
  const env = setupPaymentNotifier();
  resetMocks();

  try {
    // Setup mock booking
    mockBookingsState = [
      {
        id: 'inline-test-bk-6',
        eventId: 'inline-test-evt-6',
        tableId: 'table-6',
        seatsBooked: 2,
        status: 'reserved',
        totalAmount: 5000,
      },
    ];

    // Create payment
    const createResult = createPaymentIntentService('inline-test-bk-6', 5000);
    const paymentId = createResult.data!.id;

    // Verify mock was used (not real API)
    assert(mockTelegramCalls.length > 0, 'Should have called Telegram through mock');

    // Check that URL is not actually called
    const mockFetchUsed = (global as any).fetch === originalFetch ? false : true;
    assert(mockFetchUsed || mockTelegramCalls.length > 0, 'Should use mocked fetch');

    // Simulate callback
    const callback = parseCallback(`confirm_payment:${paymentId}`);
    const response = formatCallbackResponseMessage('123456789', callback);

    // Verify response is generated without API call
    assert(response.length > 0, 'Should have response without real API');
  } finally {
    cleanupNotifier(env);
  }
});

// ============================================================================
// TEST 7: End-to-End Flow
// ============================================================================

runTest('Complete flow: payment created -> button shown -> callback confirms', () => {
  const env = setupPaymentNotifier();
  resetMocks();

  try {
    // Setup
    mockBookingsState = [
      {
        id: 'inline-test-bk-e2e',
        eventId: 'inline-test-evt-e2e',
        tableId: 'table-e2e',
        seatsBooked: 2,
        status: 'reserved',
        totalAmount: 5000,
      },
    ];

    // Step 1: Create payment
    const createResult = createPaymentIntentService('inline-test-bk-e2e', 5000);
    assert(createResult.success, 'Step 1: Should create payment');
    const paymentId = createResult.data!.id;

    // Step 2: Verify payment created notification has button
    assert(mockTelegramCalls.length > 0, 'Step 2: Should send notification');
    const notificationCall = mockTelegramCalls[0]!;
    assert(notificationCall.keyboard, 'Step 2: Notification should have keyboard');
    const button = notificationCall.keyboard![0]![0];
    assertEquals(button.callback_data, `confirm_payment:${paymentId}`, 'Step 2: Button callback should match paymentId');

    // Step 3: Verify payment is pending
    let payment = findPaymentById(paymentId);
    assertEquals(payment?.status, 'pending', 'Step 3: Payment should be pending');

    // Step 4: User clicks button -> callback processed
    const callback = parseCallback(button.callback_data);
    assert(callback.paymentId === paymentId, 'Step 4: Callback should have correct paymentId');

    // Step 5: Callback confirms payment
    const response = formatCallbackResponseMessage('123456789', callback);
    assert(response.includes('✅'), 'Step 5: Response should indicate success');

    // Step 6: Verify payment is confirmed
    payment = findPaymentById(paymentId);
    assertEquals(payment?.status, 'paid', 'Step 6: Payment should be confirmed');
    assertEquals(payment?.confirmedBy, 'telegram-inline', 'Step 6: Should track inline confirmation');
  } finally {
    cleanupNotifier(env);
  }
});

// ============================================================================
// CLEANUP
// ============================================================================

// Restore original fetch
(global as any).fetch = originalFetch;

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
