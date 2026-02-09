export type SeatStatus = 'free' | 'locked' | 'sold';

export interface Seat {
  id: string; // Unique within table
  number: number;
  status: SeatStatus;
  price: number;
  lockedAt?: number; // Timestamp
  bookedBy?: string; // Username
  ticketImagePath?: string; // Path or URL to ticket image
}

export interface Table {
  id: string;
  number: number; // human-friendly table number
  seatsTotal: number;
  seatsAvailable: number;
  x?: number; // Percentage 0-100
  y?: number; // Percentage 0-100
  centerX: number; // Percentage 0-100
  centerY: number; // Percentage 0-100
  shape: string; // e.g. 'round' | 'rect'
}

export interface EventData {
  id: string;
  title: string;
  description: string;
  date: string;
  imageUrl: string; // Floor plan background
  layoutImageUrl?: string | null;
  schemaImageUrl?: string | null;
  tables: Table[];
  paymentPhone: string;
  maxSeatsPerBooking: number;
}

export interface Booking {
  id: string;
  eventId: string;
  username?: string;
  userTelegramId?: number;
  userPhone?: string;
  event?: { id: string; title?: string; date?: string };
  table?: { id: string; number?: number; seatsTotal?: number };
  tableBookings?: Array<{ tableId: string; seats: number; table?: { id: string; number?: number; seatsTotal?: number } | null }>;
  seatIds: string[]; // "tableId-seatId"
  seatsCount?: number;
  totalAmount?: number;
  status: 'reserved' | 'paid' | 'expired';
  createdAt: number;
  expiresAt?: string | number; // ISO string or millis
  tickets?: Array<{
    id: string;
    bookingId: string;
    eventId: string;
    seatId?: string;
    tableId?: string;
    createdAt: number;
    imageUrl?: string;
    ticketImagePath?: string;
  }>;
}

export type ViewState = 'event-list' | 'event-details' | 'admin-dashboard' | 'admin-create' | 'booking-success' | 'my-tickets';
