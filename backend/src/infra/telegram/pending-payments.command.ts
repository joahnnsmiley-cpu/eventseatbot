/**
 * Telegram /pending_payments command handler
 * Fetches and formats pending payments for admin notification
 */

import { getAllPayments, type PaymentIntent } from '../../domain/payments/payment.repository';
import { formatDateForNotification } from '../../utils/formatDate';
import { isAuthorizedAdminChat, logUnauthorizedCommand } from './telegram.security';

/**
 * Format pending payments for Telegram with authorization check
 * Returns empty string if chat is not authorized
 * Returns a human-readable message with all pending payments if authorized
 * If no pending payments, returns a message saying so
 */
export function formatPendingPaymentsMessageSecure(
  chatId: number | string | null | undefined,
): string {
  // Check authorization
  if (!isAuthorizedAdminChat(chatId)) {
    logUnauthorizedCommand(chatId, '/pending_payments');
    return ''; // Silently ignore - return empty string
  }

  // Process command if authorized
  return formatPendingPaymentsMessage();
}

/**
 * Format pending payments for Telegram
 * Returns a human-readable message with all pending payments
 * If no pending payments, returns a message saying so
 */
export function formatPendingPaymentsMessage(): string {
  try {
    // Get all payments
    const allPayments = getAllPayments();
    
    // Filter for pending payments
    const pendingPayments = allPayments.filter((p: any) => p.status === 'pending');

    // If no pending payments, return standard message
    if (pendingPayments.length === 0) {
      return 'Нет ожидающих оплат';
    }

    // Sort by creation date (newest first)
    pendingPayments.sort((a: any, b: any) => b.createdAt - a.createdAt);

    // Build message
    let message = '<b>⏳ Ожидающие оплаты</b>\n\n';

    for (let i = 0; i < pendingPayments.length; i++) {
      const payment = pendingPayments[i]!;
      const index = i + 1;

      message += `<b>${index}.</b> Payment ID: <code>${payment.id}</code>\n`;
      message += `   Booking: <code>${payment.bookingId}</code>\n`;
      message += `   Amount: <b>${payment.amount} ₽</b>\n`;
      message += `   Created: ${formatDate(payment.createdAt)}\n`;

      // Add separator between items (not after last)
      if (i < pendingPayments.length - 1) {
        message += '\n';
      }
    }

    message += `\n\n<i>Total: ${pendingPayments.length} pending payment(s)</i>`;

    return message;
  } catch (err) {
    // Never throw - log and return error message
    console.error('[PendingPaymentsCommand] Error formatting message:', err);
    return 'Error fetching pending payments';
  }
}

/**
 * Get pending payments data
 * Returns array of pending payments with required fields
 * Never throws
 */
export function getPendingPayments(): Array<{
  paymentId: string;
  bookingId: string;
  amount: number;
  createdAt: string;
}> {
  try {
    const allPayments = getAllPayments();
    const pendingPayments = allPayments.filter((p: any) => p.status === 'pending');

    return pendingPayments.map((p: any) => ({
      paymentId: p.id,
      bookingId: p.bookingId,
      amount: p.amount,
      createdAt: new Date(p.createdAt).toISOString(),
    }));
  } catch (err) {
    // Never throw - log and return empty array
    console.error('[PendingPaymentsCommand] Error getting pending payments:', err);
    return [];
  }
}

/** Format timestamp to readable date string (app timezone) */
function formatDate(timestamp: number): string {
  return formatDateForNotification(new Date(timestamp)) || 'Unknown';
}
