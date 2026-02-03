import { Telegraf, Markup } from 'telegraf';
import { getAdmins } from './db';

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
