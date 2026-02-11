/**
 * Temporary debug endpoints — NO auth.
 * Remove before production.
 */
import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/raw-bookings', async (req, res) => {
  try {
    const bookings = await db.getBookings();

    return res.json({
      count: bookings.length,
      bookings
    });
  } catch (err) {
    console.error('[DEBUG RAW BOOKINGS ERROR]', err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
