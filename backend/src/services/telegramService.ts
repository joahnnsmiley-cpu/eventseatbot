const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMINS_IDS
  ? process.env.ADMINS_IDS.split(',').map((id) => id.trim()).filter(Boolean)
  : [];

console.log('Admin IDs:', ADMIN_IDS);

export async function sendTelegramPhoto(chatId: string | number, photoUrl: string, caption?: string): Promise<void> {
  if (!BOT_TOKEN) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: caption ?? '🎟 Ваш билет',
      }),
    });
    if (res.status === 403) {
      console.warn('[Telegram] 403 Forbidden — admin may not have started the bot. Chat ID:', chatId);
    }
  } catch (error) {
    console.error('Telegram sendPhoto error:', error);
  }
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  if (!BOT_TOKEN) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
    if (res.status === 403) {
      console.warn('[Telegram] 403 Forbidden — admin may not have started the bot. Chat ID:', chatId);
    }
  } catch (error) {
    console.error('Telegram send error:', error);
  }
}

export async function notifyAdmins(text: string): Promise<void> {
  for (const adminId of ADMIN_IDS) {
    console.log('Sending admin notification to:', adminId);
    try {
      await sendTelegramMessage(adminId, text);
    } catch (error) {
      console.error('Telegram notify admin error:', adminId, error);
    }
  }
}

/** Escape user input for Telegram HTML parse_mode */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Format date for display (DD.MM.YYYY HH:mm) */
export function formatDateForNotification(date: string | number | Date | null | undefined): string {
  if (date == null) return '';
  const d = typeof date === 'number' ? new Date(date) : typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}
