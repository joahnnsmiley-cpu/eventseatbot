import { Telegraf, Markup } from 'telegraf';
import { getAdmins } from './db';
import { parseCommand } from './infra/telegram/telegram.commands';
import {
  formatPendingPaymentsMessageSecure,
  formatConfirmPaymentMessageSecure,
  formatBookingStatusMessageSecure,
} from './infra/telegram';

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

if (!BOT_TOKEN) {
  console.warn('BOT_TOKEN is not set. Telegram bot will not work.');
}

if (!API_BASE_URL) {
  console.warn('API_BASE_URL is not set. Using default http://localhost:4000');
}

// ВАЖНО: бот создаётся, но НЕ запускается
export const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

/**
 * Регистрируем handlers.
 * НИКАКОГО bot.launch() — webhook режим
 */
if (bot) {
  const fetchJson = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${API_BASE_URL}${path}`);
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  };

  const formatEventLine = (event: { title?: string; date?: string }) => {
    const title = event.title || 'Без названия';
    const date = event.date || '';
    return date ? `${title}\n${date}` : title;
  };

  bot.start(async (ctx) => {
    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('📅 События', 'public_events'),
    ]);

    await ctx.reply(
      'Привет! Я показываю опубликованные события.',
      keyboard,
    );
  });

  bot.help((ctx) => {
    ctx.reply('Нажмите «📅 События», чтобы посмотреть опубликованные события.');
  });

  bot.action('public_events', async (ctx) => {
    try {
      const events = await fetchJson<Array<{ id: string; title?: string; date?: string }>>('/public/events');
      if (!events.length) {
        await ctx.reply('Пока нет опубликованных событий.');
        return;
      }

      for (const event of events) {
        const keyboard = Markup.inlineKeyboard([
          Markup.button.callback('Открыть', `public_event:${event.id}`),
        ]);
        await ctx.reply(formatEventLine(event), keyboard);
      }
    } catch (err) {
      console.error('[PublicEvents] Failed to load events:', err);
      await ctx.reply('Не удалось загрузить события. Попробуйте позже.');
    } finally {
      await ctx.answerCbQuery();
    }
  });

  bot.action(/^public_event:(.+)$/i, async (ctx) => {
    const eventId = ctx.match[1];
    try {
      const event = await fetchJson<{
        id: string;
        title?: string;
        date?: string;
        coverImageUrl?: string | null;
        schemaImageUrl?: string | null;
      }>(`/public/events/${encodeURIComponent(eventId)}`);

      const title = event.title || 'Без названия';
      const date = event.date || '';
      await ctx.reply(`${title}\n${date}`);

      if (event.coverImageUrl) {
        await ctx.replyWithPhoto(event.coverImageUrl, { caption: 'Афиша' });
      }

      if (event.schemaImageUrl) {
        await ctx.replyWithPhoto(event.schemaImageUrl, { caption: 'Схема зала' });
      }

      await ctx.reply('Скоро здесь появится бронирование');
    } catch (err) {
      console.error('[PublicEvents] Failed to load event:', err);
      await ctx.reply('Не удалось загрузить событие. Попробуйте позже.');
    } finally {
      await ctx.answerCbQuery();
    }
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
