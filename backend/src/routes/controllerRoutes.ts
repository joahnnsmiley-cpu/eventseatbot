import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { controllerOrAdmin } from '../auth/controller.middleware';
import { db } from '../db';
import { parseEventToUtc } from '../utils/formatDate';

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
    const result = await db.markBookingAsUsed(bookingId);
    if (!result) return res.status(404).json({ error: 'Booking not found' });

    if (result.wasAlreadyUsed) {
      return res.status(409).json({ ok: false, alreadyUsed: true });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[controllerRoutes] markBookingAsUsed error:', err);
    res.status(500).json({ error: 'Failed to mark booking as used' });
  }
});

/**
 * POST /controller/bookings/by-code — find a paid booking by its short code.
 *
 * A phone with a cracked screen, a printed ticket that will not focus, a QR
 * that simply refuses: the door still has to work. The guest reads out the four
 * characters they were given, and this finds the booking for tonight.
 * Body: { code }. Returns the booking; it does not mark it used.
 */
router.post('/bookings/by-code', async (req, res) => {
  const raw = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const code = raw.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (code.length < 4) return res.status(400).json({ error: 'code must be at least 4 characters' });

  try {
    const matches = await db.findPaidBookingsByCode(code.slice(0, 4));
    if (matches.length === 0) return res.status(404).json({ error: 'not_found' });
    const HOURS = 60 * 60 * 1000;
    const tonight = [] as typeof matches;
    for (const m of matches) {
      const ev = await db.findEventById(m.eventId, true);
      const startTs = parseEventToUtc(
        (ev as any)?.event_date,
        (ev as any)?.event_time,
        (ev as any)?.timezoneOffsetMinutes ?? 180,
      );
      const inWindow = startTs == null || (Date.now() >= startTs - 12 * HOURS && Date.now() <= startTs + 12 * HOURS);
      if (!inWindow) continue;
      const table = (ev as any)?.tables?.find((t: any) => t.id === m.tableId);
      tonight.push({ ...m, eventTitle: (ev as any)?.title ?? '', tableNumber: table?.number ?? null } as any);
    }
    if (tonight.length === 0) return res.status(404).json({ error: 'wrong_date' });
    return res.json({
      bookings: tonight.map((b: any) => ({
        id: b.id,
        eventTitle: b.eventTitle,
        tableNumber: b.tableNumber,
        seats: b.seatsBooked ?? (Array.isArray(b.seatIndices) ? b.seatIndices.length : 0),
        isUsed: b.isUsed === true,
        phone: b.userPhone ?? '',
      })),
    });
  } catch (err) {
    console.error('[controllerRoutes] by-code error:', err);
    return res.status(500).json({ error: 'Failed to look up the code' });
  }
});

export default router;
