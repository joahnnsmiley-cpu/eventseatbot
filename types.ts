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
  schemaImageUrl?: string | null;
  tables: Table[];
  paymentPhone: string;
  maxSeatsPerBooking: number;
}

export interface Booking {
  id: string;
  eventId: string;
  username: string;
  userTelegramId?: number;
  seatIds: string[]; // "tableId-seatId"
  totalAmount: number;
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: number;
  expiresAt?: string; // ISO string, only for confirmed/pending bookings
}

export type ViewState = 'event-list' | 'event-details' | 'admin-dashboard' | 'admin-create' | 'booking-success' | 'my-tickets';
