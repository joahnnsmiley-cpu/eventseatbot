/**
 * Telegram /booking_status command handler
 * Fetches and formats booking status with payment info for admin notification
 */

import { getBookingStatus, type BookingStatusResult } from '../../domain/bookings/booking.status';
import { isAuthorizedAdminChat, logUnauthorizedCommand } from './telegram.security';

/**
 * Format booking status for Telegram with authorization check
 * Returns empty string if chat is not authorized
 * Returns a human-readable message with booking and payment status if authorized
 * Returns error message if booking not found
 */
export async function formatBookingStatusMessageSecure(
  chatId: number | string | null | undefined,
  bookingId: string,
): Promise<string> {
  // Check authorization
  if (!isAuthorizedAdminChat(chatId)) {
    logUnauthorizedCommand(chatId, `/booking_status ${bookingId}`);
    return ''; // Silently ignore - return empty string
  }

  // Process command if authorized
  return formatBookingStatusMessage(bookingId);
}

/**
 * Format booking status for Telegram
 * Returns a human-readable message with booking and payment status
 * Returns error message if booking not found
 * Never throws
 */
export async function formatBookingStatusMessage(bookingId: string | undefined): Promise<string> {
  try {
    // Validate bookingId
    if (!bookingId || bookingId.trim().length === 0) {
      return (
        '❌ <b>Ошибка</b>: Не указан ID бронирования\n\n' +
        '<b>Использование:</b> <code>/booking_status &lt;bookingId&gt;</code>\n\n' +
        '<i>Пример:</i> <code>/booking_status booking_123</code>'
      );
    }

    const trimmed = bookingId.trim();

    // Get booking status
    const booking = await getBookingStatus(trimmed);

    // If booking not found, return error message
    if (!booking) {
      return `❌ Ошибка: Бронирование ${trimmed} не найдено`;
    }

    // Build message with human-readable formatting
    let message = `📋 СТАТУС БРОНИРОВАНИЯ\n`;
    message += `${'='.repeat(40)}\n\n`;
    
    message += `Бронь: ${booking.bookingId}\n`;
    message += `Событие: ${booking.eventId}\n`;

    if (booking.seatsBooked) {
      message += `Мест: ${booking.seatsBooked}\n`;
    }

    message += `Статус: ${formatBookingStatus(booking.status)}\n`;

    if (booking.expiresAt) {
      const expiresDate = new Date(booking.expiresAt);
      const now = Date.now();
      const timeUntilExpiry = booking.expiresAt - now;
      
      if (timeUntilExpiry > 0) {
        const minutes = Math.floor(timeUntilExpiry / 60000);
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours > 0) {
          message += `⏱ Истекает через: ${hours}ч ${mins}м\n`;
        } else {
          message += `⏱ Истекает через: ${mins}м\n`;
        }
      } else {
        message += `⏱ Истекла\n`;
      }
      
      message += `Точное время: ${expiresDate.toLocaleString('ru-RU')}\n`;
    }

    // Add payment info with detailed formatting
    message += `\n💰 ИНФОРМАЦИЯ ОБ ОПЛАТЕ\n`;
    message += `${'='.repeat(40)}\n`;
    
    if (booking.payment) {
      message += formatPaymentBlock(booking.payment);
    } else {
      message += `Статус: ⏳ Ожидает оплату\nСумма: Не указана\n`;
    }

    return message;
  } catch (err) {
    // Never throw - log and return error message
    console.error('[BookingStatusCommand] Error formatting message:', err);
    return `❌ Ошибка: Не удалось получить информацию о бронировании`;
  }
}

/**
 * Format payment information block with human-readable details
 */
function formatPaymentBlock(payment: {
  status: string;
  amount: number;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
}): string {
  let block = '';

  if (payment.status === 'paid') {
    block += `Статус: ✅ Оплачено\n`;
    block += `Сумма: ${payment.amount} ₽\n`;
    
    if (payment.confirmedBy) {
      block += `Подтверждено: ${payment.confirmedBy}\n`;
    }
    
    if (payment.confirmedAt) {
      const confirmedDate = new Date(payment.confirmedAt);
      block += `Время: ${confirmedDate.toLocaleString('ru-RU')}\n`;
    }
  } else if (payment.status === 'pending') {
    block += `Статус: ⏳ Ожидает оплату\n`;
    block += `Сумма: ${payment.amount} ₽\n`;
    block += `Требуется подтверждение\n`;
  } else if (payment.status === 'cancelled') {
    block += `Статус: ❌ Отменено\n`;
    block += `Сумма: ${payment.amount} ₽\n`;
  } else {
    block += `Статус: ${payment.status}\n`;
    block += `Сумма: ${payment.amount} ₽\n`;
  }

  return block;
}

/**
 * Get booking status data
 * Returns booking status object or null if not found
 * Never throws
 */
export async function getBookingStatusData(bookingId: string | undefined): Promise<BookingStatusResult | null> {
  try {
    if (!bookingId) {
      return null;
    }
    return await getBookingStatus(bookingId.trim());
  } catch (err) {
    // Never throw - log and return null
    console.error('[BookingStatusCommand] Error getting booking status:', err);
    return null;
  }
}

/**
 * Format booking status value for display
 */
function formatBookingStatus(status: string): string {
  const statusMap: Record<string, string> = {
    reserved: '🟡 Ожидает оплаты',
    paid: '✅ Оплачено',
    expired: '⏰ Истекла',
  };

  return statusMap[status] || status;
}

/**
 * Format payment status value for display
 */
function formatPaymentStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '⏳ Ожидание',
    paid: '✅ Оплачено',
    cancelled: '❌ Отменено',
  };

  return statusMap[status] || status;
}
