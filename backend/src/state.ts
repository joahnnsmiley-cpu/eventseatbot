export type BookingStatus = 'reserved' | 'confirmed' | 'cancelled';

export interface InMemoryBooking {
  id: string;
  eventId: string;
  userId: string;
  seatIds: string[];
  totalPrice: number;
  status: BookingStatus;
  createdAt: number;
  expiresAt: number;
  tableBookings?: Array<{ tableId: string; seats: number; totalPrice?: number }>;
}

export const inMemoryBookings: InMemoryBooking[] = [];
