/**
 * Public payment endpoints
 * No authentication required
 */

import { Router, Request, Response } from 'express';
import { getBookings } from '../db';
import {
  createPaymentIntentService,
  cancelPayment,
  type PaymentIntent,
} from '../domain/payments';

const router = Router();

/**
 * POST /public/payments
 * Create a payment intent for a reserved booking
 * Body: { bookingId, amount }
 */
router.post('/payments', (req: Request, res: Response) => {
  const { bookingId, amount } = req.body || {};

  // Validate input
  if (!bookingId || !amount) {
    return res.status(400).json({ error: 'bookingId and amount are required' });
  }

  // Validate booking exists
  const bookings = getBookings();
  const booking = bookings.find((b: any) => b.id === bookingId);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // Validate booking is reserved
  if (booking.status !== 'reserved') {
    return res.status(400).json({
      error: 'Booking must be reserved to create a payment intent',
    });
  }

  // Create payment intent
  const result = createPaymentIntentService(bookingId, amount);
  if (!result.success) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.data);
});

/**
 * POST /public/payments/:id/pay
 * Payment confirmation is not allowed via public API.
 */
router.post('/payments/:id/pay', (req: Request, res: Response) => {
  const paymentId = String(req.params.id);
  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  return res.status(409).json({
    error: 'Payment confirmation is only allowed via POST /admin/bookings/:id/confirm',
  });
});

/**
 * POST /public/payments/:id/cancel
 * Cancel a payment
 */
router.post('/payments/:id/cancel', (req: Request, res: Response) => {
  const paymentId = String(req.params.id);

  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  const result = cancelPayment(paymentId);
  if (!result.success) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.data);
});

export default router;
