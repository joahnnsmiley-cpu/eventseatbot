import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { controllerOrAdmin } from '../auth/controller.middleware';
import { db } from '../db';

const router = Router();
router.use(authMiddleware, controllerOrAdmin);

/**
 * PATCH /controller/bookings/:id/mark-used
 * Marks a booking ticket as used (scanned at event entry).
 * Protected: controller or admin only.
 *
 * Returns { ok: true, booking } on success.
 * Returns { ok: false, alreadyUsed: true } with HTTP 409 if ticket was already used.
 */
router.patch('/bookings/:id/mark-used', async (req, res) => {
  const bookingId = req.params.id;
  if (!bookingId) return res.status(400).json({ error: 'bookingId is required' });

  try {
    const booking = await db.markBookingAsUsed(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.isUsed) {
      // markBookingAsUsed returned existing record — it was already used
      return res.status(409).json({ ok: false, alreadyUsed: true });
    }

    res.json({ ok: true, booking });
  } catch (err) {
    console.error('[controllerRoutes] markBookingAsUsed error:', err);
    res.status(500).json({ error: 'Failed to mark booking as used' });
  }
});

export default router;
