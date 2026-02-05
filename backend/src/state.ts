export type BookingStatus = 'reserved' | 'confirmed' | 'paid' | 'cancelled';

export interface InMemoryBooking {
  id: string;
  eventId: string;
  userId: any;
  seatIds: string[];
  totalPrice: number;
  status: BookingStatus;
  createdAt: number;
  expiresAt: number;
}

export const inMemoryBookings: InMemoryBooking[] = [];
