/**
 * Telegram API client for sending messages
 * Fire-and-forget approach: no retries, errors are logged
 */

/**
 * Button for inline keyboard
 */
export interface InlineButton {
  text: string;
  callback_data: string;
}

/**
 * Inline keyboard configuration
 */
export interface InlineKeyboard {
  buttons: InlineButton[][];
}

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

  /**
   * Send message with inline keyboard
   * Buttons are arranged in rows (each row is an array of buttons)
   * Fire-and-forget: errors are logged but don't throw
   */
  async sendMessageWithInlineKeyboard(
    text: string,
    keyboard: InlineKeyboard,
  ): Promise<void> {
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
          reply_markup: {
            inline_keyboard: keyboard.buttons,
          },
        }),
      });

      if (!response.ok) {
        console.error(`[TelegramClient] Failed to send message with keyboard: ${response.statusText}`);
      }
    } catch (err) {
      // Fire-and-forget: log error but don't throw
      console.error('[TelegramClient] Error sending message with keyboard:', err);
    }
  }
}
