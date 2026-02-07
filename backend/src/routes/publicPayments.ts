/**
 * Public payment endpoints
 * No authentication required
 */

import { Router, Request, Response } from 'express';
import { getBookings } from '../db';
import {
  createPaymentIntentService,
  markPaid,
  cancelPayment,
  type PaymentIntent,
} from '../domain/payments';

const router = Router();

/**
 * POST /public/payments
 * Create a payment intent for a confirmed booking
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

  // Validate booking is confirmed
  if (booking.status !== 'confirmed') {
    return res.status(400).json({
      error: 'Booking must be confirmed to create a payment intent',
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
 * Mark payment as paid with manual confirmation
 * Body: { confirmedBy }
 */
router.post('/payments/:id/pay', (req: Request, res: Response) => {
  const paymentId = String(req.params.id);
  const { confirmedBy } = req.body || {};

  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  if (!confirmedBy) {
    return res.status(400).json({ error: 'confirmedBy is required in request body' });
  }

  const result = markPaid(paymentId, confirmedBy);
  if (!result.success) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.data);
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
