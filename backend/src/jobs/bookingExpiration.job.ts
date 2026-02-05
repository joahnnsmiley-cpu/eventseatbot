import { bookings } from '../storage/booking.storage';
import { seats } from '../storage/seats.storage';

export function startBookingExpirationJob() {
  setInterval(() => {
    const now = Date.now();

    bookings.forEach((booking) => {
      if (booking.status !== 'reserved') return;
      if (booking.expiresAt > now) return;

      // expire booking
      booking.status = 'expired';

      // free seats
      booking.seatIds.forEach((seatId) => {
        const seat = seats.find((s) => s.id === seatId);
        if (seat && seat.status === 'reserved') {
          seat.status = 'available';
        }
      });

      console.log(`Booking ${booking.id} expired`);
    });
  }, 10_000); // every 10 seconds
}
