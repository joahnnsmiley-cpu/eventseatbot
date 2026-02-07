/**
 * Confirm Payment Command Handler
 * Processes /confirm_payment <paymentId> commands from Telegram
 * Validates payment exists and is pending, then marks it as paid
 */

import { findPaymentById } from '../../domain/payments/payment.repository';
import { markPaid } from '../../domain/payments/payment.service';
import type { ParsedCommand } from './telegram.commands';

export interface ConfirmPaymentResult {
  success: boolean;
  message: string;
  paymentId?: string | undefined;
}

/**
 * Format confirmation result as Telegram message
 * Never throws
 */
export function formatConfirmPaymentMessage(
  paymentId: string | undefined,
): string {
  if (!paymentId) {
    return '❌ <b>Ошибка</b>: Не указан ID платежа\n\nИспользование: <code>/confirm_payment pay-xxx</code>';
  }

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

    // Confirm the payment
    const result = markPaid(paymentId, 'telegram');

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
    console.error('[ConfirmPaymentCommand] Error confirming payment:', err);
    return '❌ <b>Ошибка</b>: Не удалось подтвердить платеж. Повторите попытку позже.';
  }
}

/**
 * Process confirm payment command
 * Takes the parsed command and returns success/error result
 */
export function processConfirmPaymentCommand(
  command: ParsedCommand,
): ConfirmPaymentResult {
  if (command.type !== 'confirm_payment') {
    return {
      success: false,
      message: 'Invalid command type',
    };
  }

  const paymentId = command.paymentId;
  const message = formatConfirmPaymentMessage(paymentId);

  if (
    message.startsWith('✅') ||
    message.includes('подтвержден</b>')
  ) {
    return {
      success: true,
      message,
      paymentId,
    };
  }

  return {
    success: false,
    message,
    paymentId,
  };
}
