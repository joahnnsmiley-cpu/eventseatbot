/**
 * Debug endpoints — admin-only.
 */
import { Router } from 'express';
import { db } from '../db';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';

const router = Router();

router.get('/raw-bookings', authMiddleware, adminOnly, async (req, res) => {
  try {
    const bookings = await db.getBookings();
    return res.json({ count: bookings.length, bookings });
  } catch (err) {
    console.error('[DEBUG RAW BOOKINGS ERROR]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
