const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMINS_ID ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  if (!BOT_TOKEN) return;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (error) {
    console.error('Telegram send error:', error);
  }
}

export async function notifyAdmins(text: string): Promise<void> {
  for (const adminId of ADMIN_IDS) {
    try {
      await sendTelegramMessage(adminId, text);
    } catch (error) {
      console.error('Telegram notify admin error:', adminId, error);
    }
  }
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
