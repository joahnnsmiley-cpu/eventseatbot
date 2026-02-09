/**
 * Payment service - business logic layer
 * Handles payment intent lifecycle
 * Soft coupling with bookings: updates booking status on payment transitions
 */

import { v4 as uuid } from 'uuid';
import {
  createPaymentIntent as repoCreate,
  findPaymentById,
  updatePaymentStatus,
  type PaymentIntent,
  type PaymentStatus,
} from './payment.repository';
import { getBookings } from '../../db';
import { emitPaymentCreated, emitPaymentConfirmed } from './payment.events';

/**
 * Service response types
 */
export interface ServiceResponse<T> {
  success: boolean;
  status: number;
  data?: T;
  error?: string;
}

/**
 * Create a new payment intent for a booking
 * - Default status: pending
 * - Emits paymentCreated event (fire-and-forget, errors don't break API)
 * - Returns the created payment intent
 */
export function createPaymentIntent(
  bookingId: string,
  amount: number,
): ServiceResponse<PaymentIntent> {
  if (!bookingId || !amount || amount <= 0) {
    return {
      success: false,
      status: 400,
      error: 'bookingId and positive amount are required',
    };
  }

  try {
    const id = uuid();
    const payment = repoCreate(id, bookingId, amount);
    
    // Emit payment created event (fire-and-forget, errors don't affect API)
    const bookings = getBookings();
    const booking = bookings.find((b: any) => b.id === bookingId);
    if (booking) {
      emitPaymentCreated({
        paymentId: id,
        bookingId,
        eventId: booking.eventId,
        tableId: booking.tableId,
        seatsBooked: booking.seatsBooked,
        amount,
        method: 'manual',
        instruction: 'Ожидается перевод по номеру телефона',
      });
    }
    
    return {
      success: true,
      status: 201,
      data: payment,
    };
  } catch (err) {
    return {
      success: false,
      status: 500,
      error: 'Failed to create payment intent',
    };
  }
}

/**
 * Mark a payment as paid
 * - Requires confirmedBy (who confirmed) and method (payment method)
 * - Sets confirmedAt to ISO timestamp
 * - Updates related booking status to 'paid'
 * - Cannot transition from paid to other states (409)
 * - Cannot mark paid if booking is already paid (409)
 * - If not found, returns 404
 */
export function markPaid(
  paymentId: string,
  confirmedBy: string,
  method: 'manual' = 'manual',
): ServiceResponse<PaymentIntent> {
  if (!paymentId || !confirmedBy) {
    return {
      success: false,
      status: 400,
      error: 'paymentId and confirmedBy are required',
    };
  }

  try {
    const payment = findPaymentById(paymentId);
    if (!payment) {
      return {
        success: false,
        status: 404,
        error: 'Payment not found',
      };
    }

    // Cannot transition from paid
    if (payment.status === 'paid') {
      return {
        success: false,
        status: 409,
        error: 'Payment is already paid and cannot be changed',
      };
    }

    // Cannot transition from cancelled
    if (payment.status === 'cancelled') {
      return {
        success: false,
        status: 409,
        error: 'Cannot pay a cancelled payment',
      };
    }

    // Validate booking state
    const bookings = getBookings();
    const booking = bookings.find((b: any) => b.id === payment.bookingId);
    if (!booking) {
      return {
        success: false,
        status: 404,
        error: 'Related booking not found',
      };
    }

    // Guard: cannot mark paid if booking is already paid
    if (booking.status === 'paid') {
      return {
        success: false,
        status: 409,
        error: 'Booking is already paid',
      };
    }

    // Update payment status with confirmation details
    const updated = updatePaymentStatus(paymentId, 'paid', {
      method,
      confirmedBy,
      confirmedAt: new Date().toISOString(),
    });
    if (!updated) {
      return {
        success: false,
        status: 500,
        error: 'Failed to update payment status',
      };
    }

    // Emit payment confirmed event (fire-and-forget, errors don't affect API)
    emitPaymentConfirmed({
      bookingId: payment.bookingId,
      amount: payment.amount,
      confirmedBy,
      confirmedAt: updated.confirmedAt!,
    });

    return {
      success: true,
      status: 200,
      data: updated,
    };
  } catch (err) {
    return {
      success: false,
      status: 500,
      error: 'Failed to mark payment as paid',
    };
  }
}

/**
 * Cancel a payment
 * - Cannot cancel if already paid (409)
 * - Cannot cancel if already cancelled (409)
 * - If not found, returns 404
 */
export function cancelPayment(paymentId: string): ServiceResponse<PaymentIntent> {
  if (!paymentId) {
    return {
      success: false,
      status: 400,
      error: 'paymentId is required',
    };
  }

  try {
    const payment = findPaymentById(paymentId);
    if (!payment) {
      return {
        success: false,
        status: 404,
        error: 'Payment not found',
      };
    }

    // Cannot cancel if already paid
    if (payment.status === 'paid') {
      return {
        success: false,
        status: 409,
        error: 'Cannot cancel a paid payment',
      };
    }

    // Cannot cancel if already cancelled
    if (payment.status === 'cancelled') {
      return {
        success: false,
        status: 409,
        error: 'Payment is already cancelled',
      };
    }

    const updated = updatePaymentStatus(paymentId, 'cancelled');
    if (!updated) {
      return {
        success: false,
        status: 500,
        error: 'Failed to update payment status',
      };
    }

    return {
      success: true,
      status: 200,
      data: updated,
    };
  } catch (err) {
    return {
      success: false,
      status: 500,
      error: 'Failed to cancel payment',
    };
  }
}
