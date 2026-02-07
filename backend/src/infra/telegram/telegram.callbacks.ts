/**
 * Telegram Callback Query Handler
 * Processes inline button clicks (callback_query events)
 */

import { isAuthorizedAdminChat, logUnauthorizedCommand } from './telegram.security';
import { findPaymentById, markPaid } from '../../domain/payments';

export interface ParsedCallback {
  type: 'confirm_payment' | 'unknown';
  paymentId?: string;
  raw: string;
}

/**
 * Parse callback_data from Telegram callback_query
 * Format: "command:payload" or just "command"
 * Never throws
 */
export function parseCallback(callbackData: string | undefined): ParsedCallback {
  if (!callbackData || callbackData.trim().length === 0) {
    return { type: 'unknown', raw: callbackData || '' };
  }

  const raw = callbackData.trim();

  // Parse "confirm_payment:paymentId" format
  if (raw.startsWith('confirm_payment:')) {
    const paymentId = raw.substring('confirm_payment:'.length);
    if (paymentId.length > 0) {
      return {
        type: 'confirm_payment',
        paymentId,
        raw,
      };
    }
  }

  return { type: 'unknown', raw };
}

/**
 * Check if callback should be processed
 * Returns true only for supported callbacks
 * Never throws
 */
export function isSupportedCallback(callback: ParsedCallback): boolean {
  return callback.type === 'confirm_payment' && callback.paymentId !== undefined;
}

/**
 * Process confirm_payment callback and confirm the payment
 * Sets confirmedBy to "telegram-inline"
 * Prevents double confirmation (returns error if already paid)
 * Never throws
 */
function processConfirmPaymentCallback(paymentId: string): string {
  try {
    // Validate payment exists
    const payment = findPaymentById(paymentId);
    if (!payment) {
      return `❌ <b>Ошибка</b>: Платеж <code>${paymentId}</code> не найден`;
    }

    // Validate payment status is pending
    if (payment.status === 'paid') {
      return `⚠️ <b>Платеж уже подтвержден</b>\n\nПлатеж <code>${paymentId}</code> уже был подтвержден`;
    }

    if (payment.status === 'cancelled') {
      return `❌ <b>Ошибка</b>: Платеж <code>${paymentId}</code> был отменен и не может быть подтвержден`;
    }

    // Confirm the payment with "telegram-inline" as the source
    const result = markPaid(paymentId, 'telegram-inline');

    if (!result.success) {
      if (result.status === 409) {
        return `⚠️ <b>Конфликт</b>: ${result.error}`;
      }
      return `❌ <b>Ошибка</b>: ${result.error || 'Не удалось подтвердить платеж'}`;
    }

    const payment_data = result.data;
    return (
      `✅ <b>Платеж подтвержден</b>\n\n` +
      `<b>Платеж:</b> <code>${paymentId}</code>\n` +
      `<b>Бронь:</b> <code>${payment_data?.bookingId}</code>\n` +
      `<b>Сумма:</b> <b>${payment_data?.amount} ₽</b>\n` +
      `<b>Статус:</b> Оплачено\n` +
      `<b>Время:</b> ${new Date(payment_data?.confirmedAt || '').toLocaleString('ru-RU')}`
    );
  } catch (err) {
    console.error('[CallbackHandler] Error confirming payment:', err);
    return '❌ <b>Ошибка</b>: Не удалось обработать платеж. Повторите попытку позже.';
  }
}

/**
 * Process callback query and return response message
 * Handles authorization and executes payment confirmation
 * Never throws
 */
export function formatCallbackResponseMessage(
  chatId: number | string | null | undefined,
  callback: ParsedCallback,
): string {
  // Check authorization first
  if (!isAuthorizedAdminChat(chatId)) {
    logUnauthorizedCommand(chatId, `callback:${callback.raw}`);
    return ''; // Silently ignore unauthorized access
  }

  // Process based on callback type
  if (callback.type === 'confirm_payment' && callback.paymentId) {
    return processConfirmPaymentCallback(callback.paymentId);
  }

  // Unknown callback
  return '';
}

/**
 * Check if callback is a known/supported command
 * Never throws
 */
export function isKnownCallback(callbackData: string | undefined): boolean {
  try {
    const callback = parseCallback(callbackData);
    return isSupportedCallback(callback);
  } catch (err) {
    console.error('[CallbackHandler] Error checking known callback:', err);
    return false;
  }
}
