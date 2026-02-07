/**
 * Telegram booking notifier
 * Sends human-readable notifications about booking events
 */

import { TelegramClient } from './telegram.client';

export interface BookingNotificationPayload {
  bookingId: string;
  eventId: string;
  username?: string;
  seats?: number;
  totalAmount?: number;
  [key: string]: any;
}

export interface BookingNotifier {
  bookingCreated(payload: BookingNotificationPayload): Promise<void>;
  bookingCancelled(payload: BookingNotificationPayload): Promise<void>;
}

export class TelegramBookingNotifier implements BookingNotifier {
  private client: TelegramClient | null = null;
  private enabled: boolean;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    // Silently disable if env vars are missing
    if (token && chatId) {
      this.client = new TelegramClient(token, chatId);
      this.enabled = true;
    } else {
      this.enabled = false;
      console.warn('[TelegramBookingNotifier] Disabled: missing TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID');
    }
  }

  async bookingCreated(payload: BookingNotificationPayload): Promise<void> {
    if (!this.enabled || !this.client) return;

    const message = this.formatBookingCreatedMessage(payload);
    await this.client.sendMessage(message);
  }

  async bookingCancelled(payload: BookingNotificationPayload): Promise<void> {
    if (!this.enabled || !this.client) return;

    const message = this.formatBookingCancelledMessage(payload);
    await this.client.sendMessage(message);
  }

  private formatBookingCreatedMessage(payload: BookingNotificationPayload): string {
    const { bookingId, eventId, username, seats, totalAmount } = payload;

    let message = `<b>📌 New Booking Created</b>\n`;
    message += `Booking ID: <code>${bookingId}</code>\n`;
    message += `Event ID: <code>${eventId}</code>\n`;
    
    if (username) {
      message += `User: ${username}\n`;
    }
    
    if (seats) {
      message += `Seats: ${seats}\n`;
    }
    
    if (totalAmount) {
      message += `Amount: ${totalAmount} ₽\n`;
    }

    return message;
  }

  private formatBookingCancelledMessage(payload: BookingNotificationPayload): string {
    const { bookingId, eventId, username } = payload;

    let message = `<b>❌ Booking Cancelled</b>\n`;
    message += `Booking ID: <code>${bookingId}</code>\n`;
    message += `Event ID: <code>${eventId}</code>\n`;
    
    if (username) {
      message += `User: ${username}\n`;
    }

    return message;
  }
}

// Export singleton instance
export const telegramBookingNotifier = new TelegramBookingNotifier();
