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

export interface Table {
  id: string;
  // Table number (human-friendly)
  number: number;
  // Total seats at this table
  seatsTotal: number;
  // Seats currently available (derived or maintained by admin)
  seatsAvailable: number;
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
  schemaImageUrl?: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'paid' | 'cancelled';

export interface Booking {
  id: string;
  eventId: string;
  userTelegramId: number;
  username: string;
  seatIds: string[];
  totalAmount: number;
  status: BookingStatus;
  createdAt: number;
  tableId?: string;
  seatsBooked?: number;
}

export interface Admin {
  id: number; // Telegram chat id
}

export interface Database {
  events: EventData[];
  bookings: Booking[];
  admins: Admin[];
}

