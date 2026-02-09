export type BookingStatus = 'reserved' | 'paid' | 'expired';

export interface Booking {
  id: string;
  userId: string;
  userPhone: string;
  eventId: string;
  seatIds: string[];
  totalPrice: number;
  status: BookingStatus;
  expiresAt: number;
  createdAt: number;
  tickets?: Array<{
    id: string;
    bookingId: string;
    eventId: string;
    seatId?: string;
    tableId?: string;
    createdAt: number;
  }>;
}
