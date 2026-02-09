export type SeatStatus = 'free' | 'locked' | 'sold';

export interface Seat {
  id: string;
  number: number;
  status: SeatStatus;
  price: number;
  lockedAt?: number;
  bookedBy?: string;
  ticketImagePath?: string;
}

export interface Ticket {
  id: string;
  bookingId: string;
  eventId: string;
  seatId?: string;
  tableId?: string;
  createdAt: number;
}

export interface Table {
  id: string;
  // Table number (human-friendly)
  number: number;
  // Total seats at this table
  seatsTotal: number;
  // Seats currently available (derived or maintained by admin)
  seatsAvailable: number;
  // Center position as percentages (0-100)
  x: number;
  y: number;
  // Center position as percentages (0-100)
  centerX: number;
  centerY: number;
  // Shape identifier, e.g. 'round' | 'rectangle'
  shape: string;
}

export interface EventData {
  id: string;
  title: string;
  description: string;
  date: string;
  imageUrl: string;
  tables: Table[];
  paymentPhone: string;
  maxSeatsPerBooking: number;
  status?: 'draft' | 'published' | 'archived';
  published?: boolean;
  layoutImageUrl?: string | null;
  schemaImageUrl?: string | null;
}

export type BookingStatus = 'reserved' | 'paid' | 'expired';

export interface Booking {
  id: string;
  eventId: string;
  userTelegramId: number;
  username: string;
  userPhone: string;
  seatIds: string[];
  totalAmount: number;
  status: BookingStatus;
  createdAt: number;
  expiresAt?: string | number; // ISO string (db) or millis (legacy/in-memory)
  tableId?: string;
  seatsBooked?: number;
  tableBookings?: Array<{ tableId: string; seats: number; totalPrice?: number }>;
  tickets?: Ticket[];
}

export interface Admin {
  id: number; // Telegram chat id
}

export interface Database {
  events: EventData[];
  bookings: Booking[];
  admins: Admin[];
}

