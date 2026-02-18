export type SeatStatus = 'free' | 'locked' | 'sold';

export interface TicketCategory {
  id: string;
  name: string;
  price: number;
  description: string;
  styleKey: string;
  /** Color key from CATEGORY_COLORS (vip, gold, silver, bronze, emerald, sapphire). Stored instead of raw hex. */
  color_key?: string;
  /** Custom hex color (e.g. #C9A227). When set, overrides color_key. */
  custom_color?: string;
  isActive: boolean;
  /** Privileges for this category (e.g. "Приоритетная посадка"). Empty or absent = no privileges block. */
  privileges?: string[];
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

/** Unified admin table model. Single source of truth for layout editing. */
export interface TableModel {
  id: string;
  number: number;
  centerXPercent: number;
  centerYPercent: number;
  shape: 'circle' | 'rect';
  widthPercent: number;
  heightPercent: number;
  rotationDeg: number;
  seatsCount: number;
  categoryId: string;
  isActive: boolean;
}

/** Legacy Table type for API/EventData compatibility. Use TableModel in admin. */
export interface Table {
  id: string;
  number?: number;
  seatsTotal?: number;
  seatsAvailable?: number;
  isAvailable?: boolean;
  is_active?: boolean;
  visibleFrom?: string | null;
  visibleUntil?: string | null;
  x?: number;
  y?: number;
  centerX?: number;
  centerY?: number;
  rotationDeg?: number;
  widthPercent?: number;
  heightPercent?: number;
  sizePercent?: number;
  shape?: 'circle' | 'rect' | string;
  color?: string;
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
  /** Only one event can be featured; shown prominently on main screen. */
  isFeatured?: boolean;
  /** Задел: позже backend будет отдавать adminTelegramId; UI уже готов к нему. */
  adminTelegramId?: string;
  /** Telegram user ID of event organizer. Used for role: user.id === organizerId → organizer. */
  organizerId?: number | null;
}

export interface Booking {
  id: string;
  eventId: string;
  tableId?: string;
  username?: string;
  userTelegramId?: number;
  userPhone?: string;
  userComment?: string | null;
  seatIndices?: number[];
  seatsBooked?: number;
  event?: { id: string; title?: string; date?: string; event_date?: string | null; event_time?: string | null; venue?: string | null };
  table?: { id: string; number?: number; seatsTotal?: number; seatsAvailable?: number; ticketCategoryId?: string };
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
