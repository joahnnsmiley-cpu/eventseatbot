/**
 * Telegram API client for sending messages
 * Fire-and-forget approach: no retries, errors are logged
 */

export class TelegramClient {
  private token: string;
  private chatId: string;
  private apiUrl = 'https://api.telegram.org';

  constructor(token: string, chatId: string) {
    this.token = token;
    this.chatId = chatId;
  }

  async sendMessage(text: string): Promise<void> {
    try {
      const url = `${this.apiUrl}/bot${this.token}/sendMessage`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        console.error(`[TelegramClient] Failed to send message: ${response.statusText}`);
      }
    } catch (err) {
      // Fire-and-forget: log error but don't throw
      console.error('[TelegramClient] Error sending message:', err);
    }
  }
}
