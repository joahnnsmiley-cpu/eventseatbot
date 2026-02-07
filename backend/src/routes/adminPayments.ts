/**
 * Admin payment endpoints
 * Manual payment confirmation for confirmed bookings
 * No authentication required yet (auth layer frozen)
 */

import { Router, Request, Response } from 'express';
import { getBookings } from '../db';
import { findPaymentById, type PaymentIntent } from '../domain/payments';
import { markPaid } from '../domain/payments';

const router = Router();

/**
 * POST /admin/payments/:id/confirm
 * Manually confirm a payment as paid
 * 
 * Requires:
 * - Payment exists and is pending (409 if already paid/cancelled)
 * - Related booking is confirmed (409 if not)
 * - confirmedBy in request body (admin name)
 * 
 * Updates:
 * - Payment: status → paid, confirmedBy, confirmedAt, method
 * - Booking: status → paid
 * 
 * Body: { confirmedBy }
 */
router.post('/payments/:id/confirm', (req: Request, res: Response) => {
  const paymentId = String(req.params.id);
  const { confirmedBy } = req.body || {};

  // Validate input
  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  if (!confirmedBy) {
    return res.status(400).json({ error: 'confirmedBy is required in request body' });
  }

  try {
    // Find payment
    const payment = findPaymentById(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Payment must be pending
    if (payment.status !== 'pending') {
      return res.status(409).json({
        error: `Payment is not pending (current status: ${payment.status})`,
      });
    }

    // Find related booking
    const bookings = getBookings();
    const booking = bookings.find((b: any) => b.id === payment.bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Related booking not found' });
    }

    // Booking must be confirmed
    if (booking.status !== 'confirmed') {
      return res.status(409).json({
        error: `Booking is not confirmed (current status: ${booking.status})`,
      });
    }

    // Mark payment as paid (will validate and update booking)
    const result = markPaid(paymentId, confirmedBy);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(200).json(result.data);
  } catch (err) {
    console.error('[AdminPayments] Error confirming payment:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
