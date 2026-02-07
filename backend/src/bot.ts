import { Telegraf, Markup } from 'telegraf';
import { getAdmins } from './db';
import { parseCommand } from './infra/telegram/telegram.commands';
import {
  formatPendingPaymentsMessageSecure,
  formatConfirmPaymentMessageSecure,
  formatBookingStatusMessageSecure,
} from './infra/telegram';

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'http://localhost:5173';

if (!BOT_TOKEN) {
  console.warn('BOT_TOKEN is not set. Telegram bot will not work.');
}

// ВАЖНО: бот создаётся, но НЕ запускается
export const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

/**
 * Регистрируем handlers.
 * НИКАКОГО bot.launch() — webhook режим
 */
if (bot) {
  bot.start((ctx) => {
    const keyboard = Markup.keyboard([
      Markup.button.webApp('Открыть план зала', WEBAPP_URL),
    ]).resize();

    ctx.reply(
      'Добро пожаловать! Нажмите «Открыть план зала», чтобы выбрать места.',
      keyboard,
    );
  });

  bot.help((ctx) => {
    ctx.reply('Используйте кнопку «Открыть план зала» для выбора мест.');
  });

  /**
   * Admin commands handler
   * Parses and executes: /pending_payments, /confirm_payment, /booking_status
   */
  bot.on('message', async (ctx) => {
    try {
      // Extract text from message - handle different message types
      const message = ctx.message;
      if (!message || !('text' in message) || !message.text) {
        return; // Silently ignore non-text messages
      }

      const text = message.text;
      const chatId = ctx.chat.id;

      // Only process if message starts with /
      if (!text.startsWith('/')) {
        return; // Silently ignore non-command messages
      }

      // Parse the command
      const parsed = parseCommand(text);

      // Handle /pending_payments command
      if (parsed.type === 'pending_payments') {
        const message = formatPendingPaymentsMessageSecure(chatId);
        if (message) {
          await ctx.replyWithHTML(message);
        }
        return;
      }

      // Handle /confirm_payment command
      if (parsed.type === 'confirm_payment' && parsed.paymentId) {
        const message = formatConfirmPaymentMessageSecure(chatId, parsed.paymentId);
        if (message) {
          await ctx.replyWithHTML(message);
        }
        return;
      }

      // Handle /booking_status command
      if (parsed.type === 'booking_status' && parsed.bookingId) {
        const message = formatBookingStatusMessageSecure(chatId, parsed.bookingId);
        if (message) {
          await ctx.reply(message);
        }
        return;
      }

      // Handle unknown/malformed commands
      if (parsed.type === 'unknown') {
        const helpMessage =
          '<b>❓ Unknown or Malformed Command</b>\n\n' +
          '<b>Available admin commands:</b>\n' +
          '• <code>/pending_payments</code> - List all pending payments\n' +
          '• <code>/confirm_payment &lt;paymentId&gt;</code> - Confirm a specific payment\n' +
          '• <code>/booking_status &lt;bookingId&gt;</code> - Get booking status\n\n' +
          '<i>Example:</i> <code>/booking_status booking_123</code>';

        await ctx.replyWithHTML(helpMessage);
        return;
      }
    } catch (err) {
      console.error('[BotAdminCommands] Error processing message:', err);
      // Silently ignore errors to prevent bot crashes
    }
  });
}

// ===== send-only helpers =====

export const notifyAdminsAboutBooking = async (text: string) => {
  if (!bot) return;
  const admins = getAdmins();
  for (const admin of admins) {
    try {
      await bot.telegram.sendMessage(admin.id, text);
    } catch (e) {
      console.error('Failed to notify admin', admin.id, e);
    }
  }
};

export const notifyUser = async (chatId: number, text: string) => {
  if (!bot) return;
  try {
    await bot.telegram.sendMessage(chatId, text);
  } catch (e) {
    console.error('Failed to notify user', chatId, e);
  }
};
