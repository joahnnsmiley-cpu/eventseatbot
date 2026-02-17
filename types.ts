export type SeatStatus = 'free' | 'locked' | 'sold';

export interface TicketCategory {
  id: string;
  name: string;
  price: number;
  description: string;
  styleKey: string;
  /** Color key from CATEGORY_COLORS (vip, gold, silver, bronze, emerald, sapphire). Stored instead of raw hex. */
  color_key?: string;
  isActive: boolean;
}

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
  x?: number; // Deprecated: use centerX
  y?: number; // Deprecated: use centerY
  centerX: number; // Percentage 0-100
  centerY: number; // Percentage 0-100
  /** Rotation in degrees. */
  rotationDeg?: number;
  /** When set with heightPercent: explicit rect dimensions (container %). */
  widthPercent?: number;
  /** When set with widthPercent: explicit rect dimensions (container %). */
  heightPercent?: number;
  sizePercent?: number;
  shape?: 'circle' | 'rect' | string; // e.g. 'circle' | 'rect'
  color?: string;
  /** Reference to TicketCategory for styling and pricing. */
  ticketCategoryId?: string;
}

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
  /** layoutImageUrl — подложка зала (seating map background). */
  layoutImageUrl?: string | null;
  /** ticketTemplateUrl — ticket template image for ticket generation. */
  ticketTemplateUrl?: string | null;
  /** layout_image_url — snake_case alias from API. */
  layout_image_url?: string | null;
  schemaImageUrl?: string | null;
  tables: Table[];
  /** Ticket categories for the event. Stored in event; sent via PUT. */
  ticketCategories?: TicketCategory[];
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
