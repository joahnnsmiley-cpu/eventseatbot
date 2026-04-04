import { Telegraf, Markup } from 'telegraf';
import { db } from './db';
import { createPendingBookingFromWebAppPayload } from './webappBooking';
import { notifyVkAdmins } from './services/vkService';

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

// In-memory map for support sessions: `${adminId}:${forwardedMsgId}` → originalUserId
const supportSessions = new Map<string, number>();

function getTelegramAdminIds(): number[] {
  return (process.env.ADMINS_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);
}

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

  bot.command('support', async (ctx) => {
    const text = ctx.message.text.replace(/^\/support\s*/i, '').trim();
    if (!text) {
      await ctx.reply('Напишите обращение после команды:\n/support ваш вопрос или проблема');
      return;
    }
    const userId = ctx.from.id;
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const adminIds = getTelegramAdminIds();
    if (adminIds.length === 0) {
      await ctx.reply('Сервис поддержки временно недоступен. Попробуйте позже.');
      return;
    }
    for (const adminId of adminIds) {
      try {
        const fwd = await ctx.telegram.sendMessage(
          adminId,
          `📩 Обращение от ${username} (ID: ${userId}):\n\n${text}\n\n_Ответьте на это сообщение, чтобы написать пользователю._`,
          { parse_mode: 'Markdown' }
        );
        supportSessions.set(`${adminId}:${fwd.message_id}`, userId);
      } catch (e) {
        console.error('[bot] Failed to forward support message to admin', adminId, e);
      }
    }
    await ctx.reply('✅ Ваше обращение отправлено организаторам. Ожидайте ответа.');
  });

  // Telegram WebApp sendData: booking payload (eventId, tableId, seats, phone)
  bot.on('message', async (ctx) => {
    // Check if this is an admin replying to a forwarded support message
    const replyTo = (ctx.message as any).reply_to_message;
    if (replyTo) {
      const adminId = ctx.from.id;
      const key = `${adminId}:${replyTo.message_id}`;
      if (supportSessions.has(key)) {
        const targetUserId = supportSessions.get(key)!;
        const replyText = (ctx.message as any).text;
        if (replyText) {
          try {
            await ctx.telegram.sendMessage(targetUserId, `💬 Ответ от организаторов:\n\n${replyText}`);
            await ctx.reply('✅ Ответ отправлен пользователю.');
          } catch (e) {
            console.error('[bot] Failed to send support reply to user', targetUserId, e);
            await ctx.reply('Не удалось доставить ответ пользователю.');
          }
        }
        return;
      }
    }

    const msg = (ctx.message as { web_app_data?: { data?: string } }) || {};
    const data = msg.web_app_data?.data;
    if (!data) return;
    try {
      const payload = JSON.parse(data);
      const { id } = await createPendingBookingFromWebAppPayload({
        eventId: String(payload.eventId ?? ''),
        tableId: String(payload.tableId ?? ''),
        seats: Array.isArray(payload.seats) ? payload.seats : [],
        phone: typeof payload.phone === 'string' ? payload.phone : '',
      });
      await ctx.reply(`Бронь создана. ID: ${id}`);
    } catch (e) {
      console.error('[bot] web_app_data booking failed', e);
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Table is not available for sale') {
        await ctx.reply('Этот стол недоступен для продажи.');
        return;
      }
      await ctx.reply('Не удалось создать бронь. Попробуйте ещё раз.');
    }
  });
}

// ===== send-only helpers =====

export const notifyAdminsAboutBooking = async (text: string) => {
  // 1. Notify TG admins (from DB)
  if (bot) {
    const admins = await db.getAdmins();
    for (const admin of admins) {
      try {
        await bot.telegram.sendMessage(admin.id, text);
      } catch (e) {
        console.error('Failed to notify admin', admin.id, e);
      }
    }
  }

  // 2. Notify VK admins (from Env)
  try {
    await notifyVkAdmins(text);
  } catch (e) {
    console.error('Failed to notify VK admins', e);
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
