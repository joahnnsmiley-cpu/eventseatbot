/**
 * Storage switch: file (data.json) vs Supabase Postgres.
 * USE_SUPABASE='true' → Postgres; otherwise file storage.
 * File impl from ./file (../db would resolve to this package = circular).
 */
import * as fileDb from './file';
import * as postgresDb from '../db-postgres';
import type { EventData, Booking, BookingStatus } from '../models';

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

if (USE_SUPABASE) {
  console.log('[Storage] Using Supabase Postgres');
} else {
  console.log('[Storage] Using local file storage');
}

// Wrap sync file API so every method returns Promise (unified async API)
const fileDbAsync = {
  getEvents: (): Promise<EventData[]> => Promise.resolve(fileDb.getEvents()),
  findEventById: (id: string): Promise<EventData | undefined> => Promise.resolve(fileDb.findEventById(id)),
  saveEvents: (events: EventData[]): Promise<void> => Promise.resolve(fileDb.saveEvents(events)),
  upsertEvent: (event: EventData): Promise<void> => Promise.resolve(fileDb.upsertEvent(event)),
  getBookings: (): Promise<Booking[]> => Promise.resolve(fileDb.getBookings()),
  addBooking: (booking: Booking): Promise<void> => Promise.resolve(fileDb.addBooking(booking)),
  saveBookings: (bookings: Booking[]): Promise<void> => Promise.resolve(fileDb.saveBookings(bookings)),
  setBookings: (bookings: Booking[]): Promise<void> => Promise.resolve(fileDb.setBookings(bookings)),
  updateBookingStatus: (bookingId: string, status: BookingStatus): Promise<Booking | undefined> =>
    Promise.resolve(fileDb.updateBookingStatus(bookingId, status)),
  getAdmins: (): Promise<{ id: number }[]> => Promise.resolve(fileDb.getAdmins()),
  setAdmins: (ids: number[]): Promise<void> => Promise.resolve(fileDb.setAdmins(ids)),
};

export const db = USE_SUPABASE ? postgresDb : fileDbAsync;
