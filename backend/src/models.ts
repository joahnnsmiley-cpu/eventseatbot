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
  x: number;
  y: number;
  label: string;
  seats: Seat[];
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
}

export type BookingStatus = 'pending' | 'paid' | 'cancelled';

export interface Booking {
  id: string;
  eventId: string;
  userTelegramId: number;
  username: string;
  seatIds: string[];
  totalAmount: number;
  status: BookingStatus;
  createdAt: number;
}

export interface Admin {
  id: number; // Telegram chat id
}

export interface Database {
  events: EventData[];
  bookings: Booking[];
  admins: Admin[];
}

