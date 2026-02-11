import { db } from '../db';

const ACTIVE_STATUSES = ['reserved', 'pending', 'awaiting_confirmation', 'paid'] as const;

/**
 * Resync seatsAvailable for all event tables based on actual bookings.
 * Recomputes: seatsAvailable = seatsTotal - sum(seatsBooked) for active bookings.
 */
export async function resyncSeatsAvailability(): Promise<void> {
  const events = await db.getEvents();
  const bookings = await db.getBookings();

  for (const ev of events) {
    const tables = ev.tables ?? [];
    for (const table of tables) {
      const activeBookings = bookings.filter(
        (b: any) =>
          b.eventId === ev.id &&
          b.tableId === table.id &&
          ACTIVE_STATUSES.includes(b.status as (typeof ACTIVE_STATUSES)[number])
      );
      const bookedSeats = activeBookings.reduce(
        (sum: number, b: any) => sum + (Number(b.seatsBooked) || 0),
        0
      );
      const seatsTotal = Math.max(0, Number(table.seatsTotal) || 0);
      table.seatsAvailable = Math.max(0, seatsTotal - bookedSeats);
    }
  }

  await db.saveEvents(events);
}
