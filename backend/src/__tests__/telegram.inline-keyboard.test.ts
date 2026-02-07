/**
 * Telegram Inline Keyboard Support Tests
 * Tests for sendMessageWithInlineKeyboard method
 * Verifies keyboard structure and API payload
 */

import { TelegramClient, type InlineButton, type InlineKeyboard } from '../infra/telegram/telegram.client';

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

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(
        () => {
          console.log(`✓ ${name}`);
          testsPassed++;
        },
        (err) => {
          console.error(`❌ ${name}: ${err.message}`);
          testsFailed++;
        }
      );
    } else {
      console.log(`✓ ${name}`);
      testsPassed++;
    }
  } catch (err) {
    console.error(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
  }
}

console.log('\n📋 Telegram Inline Keyboard Support Tests\n');

// ============================================================================
// Synchronous Tests
// ============================================================================

// Test 1
runTest('InlineButton: has text and callback_data properties', () => {
  const button: InlineButton = {
    text: 'Click me',
    callback_data: 'action_123',
  };

  assert(button.text === 'Click me', 'Should have text property');
  assert(button.callback_data === 'action_123', 'Should have callback_data property');
});

// Test 2
runTest('InlineKeyboard: supports single row of buttons', () => {
  const keyboard: InlineKeyboard = {
    buttons: [
      [
        { text: 'Yes', callback_data: 'confirm_yes' },
        { text: 'No', callback_data: 'confirm_no' },
      ],
    ],
  };

  assert(keyboard.buttons.length === 1, 'Should have 1 row');
  assert(keyboard.buttons[0]!.length === 2, 'Should have 2 buttons in row');
  assert(keyboard.buttons[0]![0]!.text === 'Yes', 'First button text');
  assert(keyboard.buttons[0]![1]!.text === 'No', 'Second button text');
});

// Test 3
runTest('InlineKeyboard: supports multiple rows of buttons', () => {
  const keyboard: InlineKeyboard = {
    buttons: [
      [{ text: 'Confirm', callback_data: 'confirm' }],
      [
        { text: 'Edit', callback_data: 'edit' },
        { text: 'Cancel', callback_data: 'cancel' },
      ],
    ],
  };

  assert(keyboard.buttons.length === 2, 'Should have 2 rows');
  assert(keyboard.buttons[0]!.length === 1, 'First row has 1 button');
  assert(keyboard.buttons[1]!.length === 2, 'Second row has 2 buttons');
});

// Test 4
runTest('TelegramClient: instantiates with token and chat ID', () => {
  const client = new TelegramClient('test-token', '123456');

  assert(client !== undefined, 'Should create client instance');
  assert(client.sendMessage !== undefined, 'Should have sendMessage method');
  assert(client.sendMessageWithInlineKeyboard !== undefined, 'Should have sendMessageWithInlineKeyboard method');
});

// Test 5: No breaking changes to sendMessage
runTest('sendMessage: still callable and unchanged', async () => {
  const client = new TelegramClient('token', '123456');

  const originalFetch = (global as any).fetch;
  let fetchCalled = false;
  let sentBody: any = null;

  (global as any).fetch = async (url: string, options?: RequestInit) => {
    fetchCalled = true;
    sentBody = JSON.parse(options?.body as string);
    return { ok: true, statusText: 'OK' } as Response;
  };

  await client.sendMessage('Test message');

  assert(fetchCalled, 'Should call fetch');
  assert(sentBody.text === 'Test message', 'Should include text');
  assert(sentBody.reply_markup === undefined, 'Should NOT include reply_markup');
  assert(sentBody.parse_mode === 'HTML', 'Should set parse_mode');

  (global as any).fetch = originalFetch;
});

// Test 6: sendMessageWithInlineKeyboard basic call
runTest('sendMessageWithInlineKeyboard: sends API call with keyboard', async () => {
  const client = new TelegramClient('token', '123456');
  const keyboard: InlineKeyboard = {
    buttons: [[{ text: 'Yes', callback_data: 'yes_action' }]],
  };

  const originalFetch = (global as any).fetch;
  let fetchCalled = false;
  let sentUrl = '';
  let sentBody: any = null;

  (global as any).fetch = async (url: string, options?: RequestInit) => {
    fetchCalled = true;
    sentUrl = url;
    sentBody = JSON.parse(options?.body as string);
    return { ok: true, statusText: 'OK' } as Response;
  };

  await client.sendMessageWithInlineKeyboard('Confirm?', keyboard);

  assert(fetchCalled, 'Should call fetch');
  assert(sentUrl.includes('sendMessage'), 'Should use sendMessage endpoint');
  assert(sentBody.text === 'Confirm?', 'Should include text');
  assert(sentBody.reply_markup !== undefined, 'Should include reply_markup');
  assert(sentBody.reply_markup.inline_keyboard !== undefined, 'Should include inline_keyboard');

  (global as any).fetch = originalFetch;
});

// Test 7: Button payload structure
runTest('sendMessageWithInlineKeyboard: keyboard buttons in correct format', async () => {
  const client = new TelegramClient('token', '123456');
  const keyboard: InlineKeyboard = {
    buttons: [
      [
        { text: 'Option 1', callback_data: 'opt1' },
        { text: 'Option 2', callback_data: 'opt2' },
      ],
    ],
  };

  const originalFetch = (global as any).fetch;
  let sentBody: any = null;

  (global as any).fetch = async (url: string, options?: RequestInit) => {
    sentBody = JSON.parse(options?.body as string);
    return { ok: true, statusText: 'OK' } as Response;
  };

  await client.sendMessageWithInlineKeyboard('Choose:', keyboard);

  const buttons = sentBody.reply_markup.inline_keyboard[0];
  assert(buttons[0].text === 'Option 1', 'Button text should match');
  assert(buttons[0].callback_data === 'opt1', 'Callback data should match');
  assert(buttons[1].text === 'Option 2', 'Second button text');
  assert(buttons[1].callback_data === 'opt2', 'Second button callback');

  (global as any).fetch = originalFetch;
});

// Test 8: Multiple rows
runTest('sendMessageWithInlineKeyboard: supports multiple rows', async () => {
  const client = new TelegramClient('token', '123456');
  const keyboard: InlineKeyboard = {
    buttons: [
      [{ text: 'Row1Btn1', callback_data: 'r1b1' }],
      [
        { text: 'Row2Btn1', callback_data: 'r2b1' },
        { text: 'Row2Btn2', callback_data: 'r2b2' },
      ],
      [{ text: 'Row3Btn1', callback_data: 'r3b1' }],
    ],
  };

  const originalFetch = (global as any).fetch;
  let sentBody: any = null;

  (global as any).fetch = async (url: string, options?: RequestInit) => {
    sentBody = JSON.parse(options?.body as string);
    return { ok: true, statusText: 'OK' } as Response;
  };

  await client.sendMessageWithInlineKeyboard('Multi-row', keyboard);

  const inlineKeyboard = sentBody.reply_markup.inline_keyboard;
  assert(inlineKeyboard.length === 3, 'Should have 3 rows');
  assert(inlineKeyboard[0].length === 1, 'Row 1 has 1 button');
  assert(inlineKeyboard[1].length === 2, 'Row 2 has 2 buttons');
  assert(inlineKeyboard[2].length === 1, 'Row 3 has 1 button');

  (global as any).fetch = originalFetch;
});

// Test 9: Empty keyboard
runTest('sendMessageWithInlineKeyboard: handles empty keyboard', async () => {
  const client = new TelegramClient('token', '123456');
  const keyboard: InlineKeyboard = { buttons: [] };

  const originalFetch = (global as any).fetch;
  let sentBody: any = null;

  (global as any).fetch = async (url: string, options?: RequestInit) => {
    sentBody = JSON.parse(options?.body as string);
    return { ok: true, statusText: 'OK' } as Response;
  };

  await client.sendMessageWithInlineKeyboard('No buttons', keyboard);

  assert(sentBody.reply_markup.inline_keyboard.length === 0, 'Should allow empty keyboard');

  (global as any).fetch = originalFetch;
});

// Test 10: Special characters
runTest('sendMessageWithInlineKeyboard: handles special characters', async () => {
  const client = new TelegramClient('token', '123456');
  const keyboard: InlineKeyboard = {
    buttons: [
      [
        { text: 'Платить 5000 ₽', callback_data: 'pay_5000' },
        { text: 'Отмена ❌', callback_data: 'cancel' },
      ],
    ],
  };

  const originalFetch = (global as any).fetch;
  let sentBody: any = null;

  (global as any).fetch = async (url: string, options?: RequestInit) => {
    sentBody = JSON.parse(options?.body as string);
    return { ok: true, statusText: 'OK' } as Response;
  };

  await client.sendMessageWithInlineKeyboard('Test', keyboard);

  const buttons = sentBody.reply_markup.inline_keyboard[0];
  assert(buttons[0].text === 'Платить 5000 ₽', 'Should preserve Cyrillic');
  assert(buttons[1].text === 'Отмена ❌', 'Should preserve emoji');

  (global as any).fetch = originalFetch;
});

// Test 11: HTML formatted text
runTest('sendMessageWithInlineKeyboard: supports HTML formatted text', async () => {
  const client = new TelegramClient('token', '123456');
  const keyboard: InlineKeyboard = {
    buttons: [[{ text: 'Confirm', callback_data: 'confirm' }]],
  };
  const htmlText = '<b>Bold</b> <i>Italic</i> <code>code</code>';

  const originalFetch = (global as any).fetch;
  let sentBody: any = null;

  (global as any).fetch = async (url: string, options?: RequestInit) => {
    sentBody = JSON.parse(options?.body as string);
    return { ok: true, statusText: 'OK' } as Response;
  };

  await client.sendMessageWithInlineKeyboard(htmlText, keyboard);

  assert(sentBody.text === htmlText, 'Should preserve HTML formatting');
  assert(sentBody.parse_mode === 'HTML', 'Should set parse_mode to HTML');

  (global as any).fetch = originalFetch;
});

// Test 12: Network error handling
runTest('sendMessageWithInlineKeyboard: handles network errors gracefully', async () => {
  const client = new TelegramClient('token', '123456');
  const keyboard: InlineKeyboard = {
    buttons: [[{ text: 'Button', callback_data: 'action' }]],
  };

  const originalFetch = (global as any).fetch;
  (global as any).fetch = async () => {
    throw new Error('Network error');
  };

  let threw = false;
  try {
    await client.sendMessageWithInlineKeyboard('Test', keyboard);
  } catch (err) {
    threw = true;
  }

  assert(!threw, 'Should not throw on network error (fire-and-forget)');

  (global as any).fetch = originalFetch;
});

// Test 13: Bad response handling
runTest('sendMessageWithInlineKeyboard: handles bad responses gracefully', async () => {
  const client = new TelegramClient('token', '123456');
  const keyboard: InlineKeyboard = {
    buttons: [[{ text: 'Button', callback_data: 'action' }]],
  };

  const originalFetch = (global as any).fetch;
  (global as any).fetch = async () => ({
    ok: false,
    statusText: 'Bad Request',
  } as Response);

  let threw = false;
  try {
    await client.sendMessageWithInlineKeyboard('Test', keyboard);
  } catch (err) {
    threw = true;
  }

  assert(!threw, 'Should not throw on bad response (fire-and-forget)');

  (global as any).fetch = originalFetch;
});

// Test 14: Large number of buttons
runTest('sendMessageWithInlineKeyboard: handles many buttons', async () => {
  const client = new TelegramClient('token', '123456');

  const buttons: InlineButton[][] = [];
  for (let i = 0; i < 5; i++) {
    const row: InlineButton[] = [];
    for (let j = 0; j < 3; j++) {
      row.push({
        text: `Btn-${i}-${j}`,
        callback_data: `action_${i}_${j}`,
      });
    }
    buttons.push(row);
  }

  const keyboard: InlineKeyboard = { buttons };

  const originalFetch = (global as any).fetch;
  let sentBody: any = null;

  (global as any).fetch = async (url: string, options?: RequestInit) => {
    sentBody = JSON.parse(options?.body as string);
    return { ok: true, statusText: 'OK' } as Response;
  };

  await client.sendMessageWithInlineKeyboard('Many buttons', keyboard);

  const inlineKeyboard = sentBody.reply_markup.inline_keyboard;
  assert(inlineKeyboard.length === 5, 'Should have 5 rows');
  inlineKeyboard.forEach((row: any, i: number) => {
    assert(row.length === 3, `Row ${i} should have 3 buttons`);
  });

  (global as any).fetch = originalFetch;
});

// Test 15: API format compliance
runTest('sendMessageWithInlineKeyboard: matches Telegram API format', async () => {
  const client = new TelegramClient('test-token', '987654321');
  const keyboard: InlineKeyboard = {
    buttons: [
      [
        { text: 'Pay', callback_data: 'pay_action' },
        { text: 'Cancel', callback_data: 'cancel_action' },
      ],
    ],
  };

  const originalFetch = (global as any).fetch;
  let sentBody: any = null;

  (global as any).fetch = async (url: string, options?: RequestInit) => {
    sentBody = JSON.parse(options?.body as string);
    return { ok: true, statusText: 'OK' } as Response;
  };

  await client.sendMessageWithInlineKeyboard('Payment?', keyboard);

  // Verify Telegram API format
  assert(sentBody.chat_id === '987654321', 'Should include chat_id');
  assert(sentBody.text === 'Payment?', 'Should include text');
  assert(sentBody.parse_mode === 'HTML', 'Should include parse_mode');
  assert(
    JSON.stringify(sentBody.reply_markup.inline_keyboard) ===
      JSON.stringify([
        [
          { text: 'Pay', callback_data: 'pay_action' },
          { text: 'Cancel', callback_data: 'cancel_action' },
        ],
      ]),
    'Keyboard should match exact format'
  );

  (global as any).fetch = originalFetch;
});

// ============================================================================
// Summary
// ============================================================================

setTimeout(() => {
  console.log('\n==================================================');
  console.log(`Tests: ${testsPassed}/${testsPassed + testsFailed} passed`);
  if (testsFailed === 0) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log(`❌ ${testsFailed} test(s) failed`);
    process.exit(1);
  }
}, 1000);
