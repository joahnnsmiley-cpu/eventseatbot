/**
 * Admin payment endpoints
 * Manual payment confirmation for reserved bookings
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';
import { getBookings } from '../db';
import { findPaymentById, type PaymentIntent } from '../domain/payments';

const router = Router();

router.use(authMiddleware, adminOnly);

/**
 * POST /admin/payments/:id/confirm
 * Informational endpoint (payment confirmation via /admin/bookings/:id/confirm)
 * 
 * Requires:
 * - Payment exists and is pending (409 if already paid/cancelled)
 * - Related booking is reserved (409 if not)
 * 
 * Does NOT confirm payments.
 */
router.post('/payments/:id/confirm', (req: Request, res: Response) => {
  const paymentId = String(req.params.id);
  // Validate input
  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
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

    // Booking must be reserved
    if (booking.status !== 'reserved') {
      return res.status(409).json({
        error: `Booking is not reserved (current status: ${booking.status})`,
      });
    }

    return res.status(409).json({
      error: 'Payment confirmation is only allowed via POST /admin/bookings/:id/confirm',
    });
  } catch (err) {
    console.error('[AdminPayments] Error confirming payment:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
