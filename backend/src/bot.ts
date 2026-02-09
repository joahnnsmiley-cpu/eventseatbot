import { Telegraf, Markup } from 'telegraf';
import { getAdmins } from './db';

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const WEBAPP_URL = process.env.WEBAPP_URL || `${API_BASE_URL}/public/view`;

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
  bot.start(async (ctx) => {
    const keyboard = Markup.inlineKeyboard([
      Markup.button.url('Открыть WebApp', WEBAPP_URL),
    ]);

    await ctx.reply('Привет! Откройте WebApp для бронирования.', keyboard);
  });

  bot.help((ctx) => {
    const keyboard = Markup.inlineKeyboard([
      Markup.button.url('Открыть WebApp', WEBAPP_URL),
    ]);
    ctx.reply('Используйте WebApp для бронирования.', keyboard);
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
