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
  /** When absent, treat as false. */
  isAvailable?: boolean;
  /** When false, table is hidden from layout (soft-deleted). When absent, treat as true. */
  is_active?: boolean;
  /** ISO string; when to start showing table to public. NULL = no start limit. */
  visibleFrom?: string | null;
  /** ISO string; when to stop showing table to public. NULL = no end limit. */
  visibleUntil?: string | null;
  // Center position as percentages (0-100)
  x: number;
  y: number;
  // Center position as percentages (0-100)
  centerX: number;
  centerY: number;
  // Shape identifier, e.g. 'round' | 'rectangle'
  sizePercent?: number;
  /** For rect: width as % of container. Must be > 0 when shape=rect. */
  widthPercent?: number;
  /** For rect: height as % of container. Must be > 0 when shape=rect. */
  heightPercent?: number;
  /** Rotation in degrees (-180 to 180). */
  rotationDeg?: number;
  shape?: 'circle' | 'rect' | string;
  color?: string;
}

export type EventStatus = 'draft' | 'published' | 'archived';

export interface EventData {
  id: string;
  title: string;
  description: string;
  date: string;
  /** event_date — date only (YYYY-MM-DD). */
  event_date?: string | null;
  /** event_time — time only (HH:mm or HH:mm:ss). */
  event_time?: string | null;
  /** venue — location/place name. */
  venue?: string | null;
  /** imageUrl — афиша события (poster / cover). */
  imageUrl?: string | null;
  tables: Table[];
  paymentPhone: string;
  maxSeatsPerBooking: number;
  /** Canonical state: draft | published | archived. When absent, derived from published (published=true → 'published', false → 'draft'). */
  status?: EventStatus;
  /** Kept for backward compatibility; sync with status (status === 'published' ⇔ published === true). */
  published?: boolean;
  /** layoutImageUrl — подложка зала (seating map background). */
  layoutImageUrl?: string | null;
  schemaImageUrl?: string | null;
}

export type BookingStatus = 'reserved' | 'paid' | 'expired' | 'pending' | 'awaiting_confirmation' | 'cancelled';

export interface Booking {
  id: string;
  eventId: string;
  userTelegramId: number;
  username: string;
  userPhone: string;
  userComment?: string | null;
  seatIds: string[];
  totalAmount: number;
  status: BookingStatus;
  createdAt: number;
  expiresAt?: string | number; // ISO string (db) or millis (legacy/in-memory)
  tableId?: string;
  seatsBooked?: number;
  /** Selected seat indices for table booking (BOOKING v1). */
  seatIndices?: number[];
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

