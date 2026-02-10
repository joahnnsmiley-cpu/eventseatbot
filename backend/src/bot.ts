import { Telegraf, Markup } from 'telegraf';
import { getAdmins } from './db';
import { createPendingBookingFromWebAppPayload } from './webappBooking';

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
  bot.telegram.setChatMenuButton({
    menuButton: {
      type: 'web_app',
      text: '🎟 Выбрать место',
      web_app: { url: WEBAPP_URL },
    },
  }).catch((e) => {
    console.error('Failed to set chat menu button', e);
  });

  bot.start(async (ctx) => {
    const keyboard = Markup.keyboard([
      [Markup.button.webApp('🎟 Выбрать место', WEBAPP_URL)],
    ]).resize();

    await ctx.reply('Привет! Нажмите кнопку ниже, чтобы открыть WebApp.', keyboard);
  });

  bot.help((ctx) => {
    ctx.reply('Используйте кнопку "🎟 Выбрать место" в сообщении /start.');
  });

  // Telegram WebApp sendData: booking payload (eventId, tableId, seats, phone)
  bot.on('message', async (ctx) => {
    const msg = (ctx.message as { web_app_data?: { data?: string } }) || {};
    const data = msg.web_app_data?.data;
    if (!data) return;
    try {
      const payload = JSON.parse(data);
      const { id } = createPendingBookingFromWebAppPayload({
        eventId: String(payload.eventId ?? ''),
        tableId: String(payload.tableId ?? ''),
        seats: Array.isArray(payload.seats) ? payload.seats : [],
        phone: typeof payload.phone === 'string' ? payload.phone : '',
      });
      await ctx.reply(`Бронь создана. ID: ${id}`);
    } catch (e) {
      console.error('[bot] web_app_data booking failed', e);
      await ctx.reply('Не удалось создать бронь. Попробуйте ещё раз.');
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
