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
  /** When absent, treat as false. */
  isAvailable?: boolean;
  /** When false, table is hidden from layout (soft-deleted). When absent, treat as true. */
  is_active?: boolean;
  /** ISO string; when to start showing table to public. NULL = no start limit. */
  visibleFrom?: string | null;
  /** ISO string; when to stop showing table to public. NULL = no end limit. */
  visibleUntil?: string | null;
  x?: number; // Percentage 0-100
  y?: number; // Percentage 0-100
  centerX: number; // Percentage 0-100
  centerY: number; // Percentage 0-100
  sizePercent?: number;
  shape?: 'circle' | 'rect' | string; // e.g. 'circle' | 'rect'
  color?: string;
}

export interface EventData {
  id: string;
  title: string;
  description: string;
  date: string;
  /** imageUrl — афиша события (poster / cover). */
  imageUrl?: string | null;
  /** layoutImageUrl — подложка зала (seating map background). */
  layoutImageUrl?: string | null;
  schemaImageUrl?: string | null;
  tables: Table[];
  paymentPhone: string;
  maxSeatsPerBooking: number;
  published?: boolean;
  status?: 'draft' | 'published' | 'archived';
  /** Задел: позже backend будет отдавать adminTelegramId; UI уже готов к нему. */
  adminTelegramId?: string;
}

export interface Booking {
  id: string;
  eventId: string;
  username?: string;
  userTelegramId?: number;
  userPhone?: string;
  userComment?: string | null;
  event?: { id: string; title?: string; date?: string };
  table?: { id: string; number?: number; seatsTotal?: number };
  tableBookings?: Array<{ tableId: string; seats: number; table?: { id: string; number?: number; seatsTotal?: number } | null }>;
  seatIds: string[]; // "tableId-seatId"
  seatsCount?: number;
  totalAmount?: number;
  status: 'reserved' | 'paid' | 'expired' | 'awaiting_confirmation';
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
