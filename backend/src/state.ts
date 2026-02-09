import type { Ticket } from './models';

export type BookingStatus = 'reserved' | 'paid' | 'expired';

export interface InMemoryBooking {
  id: string;
  eventId: string;
  userId: string;
  userPhone: string;
  seatIds: string[];
  totalPrice: number;
  status: BookingStatus;
  createdAt: number;
  expiresAt: number;
  tableBookings?: Array<{ tableId: string; seats: number; totalPrice?: number }>;
  tickets?: Ticket[];
}

export const inMemoryBookings: InMemoryBooking[] = [];
