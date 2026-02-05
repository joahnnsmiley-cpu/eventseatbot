export type BookingStatus = 'reserved' | 'confirmed' | 'expired';

export interface Booking {
  id: string;
  userId: string;
  eventId: string;
  seatIds: string[];
  totalPrice: number;
  status: BookingStatus;
  expiresAt: number;
  createdAt: number;
}
