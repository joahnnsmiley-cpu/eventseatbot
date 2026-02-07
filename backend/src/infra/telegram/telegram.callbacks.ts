/**
 * Telegram Callback Query Handler
 * Processes inline button clicks (callback_query events)
 */

import { isAuthorizedAdminChat, logUnauthorizedCommand } from './telegram.security';
import { formatConfirmPaymentMessage } from './confirm-payment.command';

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
 * Process callback query and return response message
 * Handles authorization and never throws
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
    try {
      return formatConfirmPaymentMessage(callback.paymentId);
    } catch (err) {
      console.error('[CallbackHandler] Error processing confirm_payment callback:', err);
      return '❌ <b>Ошибка</b>: Не удалось обработать платеж. Повторите попытку позже.';
    }
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
