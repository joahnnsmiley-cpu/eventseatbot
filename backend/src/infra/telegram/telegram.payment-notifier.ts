/**
 * Telegram Payment Event Notifier
 * Sends payment notifications to admin chat
 */

import type { PaymentCreatedEvent, PaymentConfirmedEvent, PaymentEventNotifier } from '../../domain/payments/payment.events';
import { TelegramClient } from './telegram.client';

export class TelegramPaymentNotifier implements PaymentEventNotifier {
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
      console.warn('[TelegramPaymentNotifier] Disabled: missing TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID');
    }
  }

  async paymentCreated(event: PaymentCreatedEvent): Promise<void> {
    if (!this.enabled || !this.client) return;

    const message = this.formatPaymentCreatedMessage(event);
    await this.client.sendMessage(message);
  }

  async paymentConfirmed(event: PaymentConfirmedEvent): Promise<void> {
    if (!this.enabled || !this.client) return;

    const message = this.formatPaymentConfirmedMessage(event);
    await this.client.sendMessage(message);
  }

  private formatPaymentCreatedMessage(event: PaymentCreatedEvent): string {
    const { bookingId, eventId, tableId, seatsBooked, amount, instruction } = event;

    let message = `<b>💰 New Payment Created</b>\n\n`;
    message += `<b>Booking:</b> <code>${bookingId}</code>\n`;
    message += `<b>Event:</b> <code>${eventId}</code>\n`;

    if (tableId) {
      message += `<b>Table:</b> <code>${tableId}</code>\n`;
    }

    if (seatsBooked) {
      message += `<b>Seats:</b> ${seatsBooked}\n`;
    }

    message += `<b>Amount:</b> <b>${amount} ₽</b>\n`;
    message += `<b>Method:</b> Manual Transfer\n`;
    message += `<b>Instruction:</b> ${instruction}\n`;

    return message;
  }

  private formatPaymentConfirmedMessage(event: PaymentConfirmedEvent): string {
    const { bookingId, amount, confirmedBy, confirmedAt } = event;

    let message = `<b>✅ Payment Confirmed</b>\n\n`;
    message += `<b>Booking:</b> <code>${bookingId}</code>\n`;
    message += `<b>Amount:</b> <b>${amount} ₽</b>\n`;
    message += `<b>Confirmed by:</b> ${confirmedBy}\n`;
    message += `<b>Confirmed at:</b> ${new Date(confirmedAt).toLocaleString('ru-RU')}\n`;

    return message;
  }

  // No inline actions: payment confirmation only via WebApp.
}

// Export singleton instance
export const telegramPaymentNotifier = new TelegramPaymentNotifier();
