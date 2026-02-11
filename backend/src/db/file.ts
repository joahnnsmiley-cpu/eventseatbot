import fs from 'fs';
import path from 'path';
import type { Database, EventData, Booking, BookingStatus, Ticket } from '../models';

const DATA_FILE = path.join(__dirname, '..', '..', 'data.json');

const normalizeTableCoordinates = (t: any) => {
  if (!t || typeof t !== 'object') return false;
  const hasX = typeof t.x === 'number' && Number.isFinite(t.x);
  const hasY = typeof t.y === 'number' && Number.isFinite(t.y);
  const hasCenterX = typeof t.centerX === 'number' && Number.isFinite(t.centerX);
  const hasCenterY = typeof t.centerY === 'number' && Number.isFinite(t.centerY);
  let changed = false;

  if (!hasX && hasCenterX) {
    t.x = t.centerX;
    changed = true;
  }
  if (!hasY && hasCenterY) {
    t.y = t.centerY;
    changed = true;
  }
  if (!hasCenterX && hasX) {
    t.centerX = t.x;
    changed = true;
  }
  if (!hasCenterY && hasY) {
    t.centerY = t.y;
    changed = true;
  }

  return changed;
};

/** Backward compat: derive status from published when missing, and published from status when missing. */
function normalizeEventStatus(ev: EventData): EventData {
  const published = ev.published ?? (ev.status === 'published');
  const status = ev.status ?? (published ? 'published' : 'draft');
  return { ...ev, status, published };
}

const ensureFile = () => {
  if (!fs.existsSync(DATA_FILE)) {
    const initial: Database = {
      events: [],
      bookings: [],
      admins: [],
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  }
};

const readDb = (): Database => {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as Database;
  // Migrate old events: map schemaImageUrl -> layoutImageUrl safely (idempotent)
  let migrationHappened = false;
  if (Array.isArray((parsed as any).events)) {
    (parsed as any).events.forEach((ev: any) => {
      if (
        ev &&
        typeof ev.layoutImageUrl === 'undefined' &&
        typeof ev.schemaImageUrl !== 'undefined' &&
        ev.schemaImageUrl !== null
      ) {
        ev.layoutImageUrl = ev.schemaImageUrl;
        migrationHappened = true;
      }
      if (ev && Array.isArray(ev.tables)) {
        ev.tables.forEach((t: any, ti: number) => {
          const changed = normalizeTableCoordinates(t);
          if (changed) {
            migrationHappened = true;
          }
        });
      }
    });
  }
  if (migrationHappened) {
    console.info('[DB] Applied safe layoutImageUrl migration');
  }

  // Validate events on read — fail fast if corrupted
  const errors: string[] = [];
  const validateTable = (t: any, eventId: string, tableIdx: number) => {
    const errs: string[] = [];
    if (typeof t.number !== 'number' || Number.isNaN(t.number)) errs.push(`tables[${tableIdx}].number must be a number`);
    if (typeof t.seatsTotal !== 'number' || Number.isNaN(t.seatsTotal) || t.seatsTotal <= 0) errs.push(`tables[${tableIdx}].seatsTotal must be a number > 0`);
    if (typeof t.seatsAvailable !== 'number' || Number.isNaN(t.seatsAvailable) || t.seatsAvailable < 0) errs.push(`tables[${tableIdx}].seatsAvailable must be a number >= 0`);
    if (typeof t.x !== 'number' || Number.isNaN(t.x) || t.x < 0 || t.x > 100) errs.push(`tables[${tableIdx}].x must be between 0 and 100`);
    if (typeof t.y !== 'number' || Number.isNaN(t.y) || t.y < 0 || t.y > 100) errs.push(`tables[${tableIdx}].y must be between 0 and 100`);
    if (typeof t.centerX !== 'number' || Number.isNaN(t.centerX) || t.centerX < 0 || t.centerX > 100) errs.push(`tables[${tableIdx}].centerX must be between 0 and 100`);
    if (typeof t.centerY !== 'number' || Number.isNaN(t.centerY) || t.centerY < 0 || t.centerY > 100) errs.push(`tables[${tableIdx}].centerY must be between 0 and 100`);
    return errs;
  };

  const validateEvent = (e: any, idx: number) => {
    const errs: string[] = [];
    if (!e) {
      errs.push(`events[${idx}] is invalid`);
      return errs;
    }
    // schemaImageUrl may be null for migrated events; do not block admin reads.
    if (!Array.isArray(e.tables)) errs.push('tables must be an array');
    else {
      e.tables.forEach((t: any, ti: number) => {
        normalizeTableCoordinates(t);
        const terrs = validateTable(t, e.id || `events[${idx}]`, ti);
        errs.push(...terrs.map(x => `tables[${ti}]: ${x}`));
      });
    }
    return errs;
  };

  if (Array.isArray(parsed.events)) {
    parsed.events.forEach((ev, i) => {
      const evErrs = validateEvent(ev, i);
      if (evErrs.length) {
        errors.push(`Event ${ev?.id || i}: ${evErrs.join('; ')}`);
      }
    });
  }

  if (errors.length) {
    console.error('Data validation failed for persisted events:');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }

  return parsed as Database;
};

const writeDb = (db: Database) => {
  // Validate events before persisting
  const validationErrors: string[] = [];
  const validateTable = (t: any, tableIdx: number) => {
    const errs: string[] = [];
    if (typeof t.number !== 'number' || Number.isNaN(t.number)) errs.push(`tables[${tableIdx}].number must be a number`);
    if (typeof t.seatsTotal !== 'number' || Number.isNaN(t.seatsTotal) || t.seatsTotal <= 0) errs.push(`tables[${tableIdx}].seatsTotal must be a number > 0`);
    if (typeof t.seatsAvailable !== 'number' || Number.isNaN(t.seatsAvailable) || t.seatsAvailable < 0) errs.push(`tables[${tableIdx}].seatsAvailable must be a number >= 0`);
    if (typeof t.x !== 'number' || Number.isNaN(t.x) || t.x < 0 || t.x > 100) errs.push(`tables[${tableIdx}].x must be between 0 and 100`);
    if (typeof t.y !== 'number' || Number.isNaN(t.y) || t.y < 0 || t.y > 100) errs.push(`tables[${tableIdx}].y must be between 0 and 100`);
    if (typeof t.centerX !== 'number' || Number.isNaN(t.centerX) || t.centerX < 0 || t.centerX > 100) errs.push(`tables[${tableIdx}].centerX must be between 0 and 100`);
    if (typeof t.centerY !== 'number' || Number.isNaN(t.centerY) || t.centerY < 0 || t.centerY > 100) errs.push(`tables[${tableIdx}].centerY must be between 0 and 100`);
    return errs;
  };

  const validateEvent = (e: any, idx: number) => {
    const errs: string[] = [];
    if (!e) {
      errs.push(`events[${idx}] is invalid`);
      return errs;
    }
    // schemaImageUrl may be null for migrated events; do not block writes.
    if (!Array.isArray(e.tables)) errs.push('tables must be an array');
    else {
      e.tables.forEach((t: any, ti: number) => {
        normalizeTableCoordinates(t);
        const terrs = validateTable(t, ti);
        errs.push(...terrs.map(x => `tables[${ti}]: ${x}`));
      });
    }
    return errs;
  };

  if (Array.isArray(db.events)) {
    db.events.forEach((ev, i) => {
      const evErrs = validateEvent(ev, i);
      if (evErrs.length) validationErrors.push(`Event ${ev?.id || i}: ${evErrs.join('; ')}`);
    });
  }

  if (validationErrors.length) {
    console.error('Validation errors detected when writing DB:');
    validationErrors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
};

export const getEvents = (): EventData[] => {
  return readDb().events.map(normalizeEventStatus);
};

export const saveEvents = (events: EventData[]) => {
  const db = readDb();
  db.events = events;
  writeDb(db);
};

export const getBookings = (): Booking[] => {
  return readDb().bookings;
};

export const saveBookings = (bookings: Booking[]) => {
  const db = readDb();
  db.bookings = bookings;
  writeDb(db);
};

export const setBookings = (bookings: Booking[]) => {
  const db = readDb();
  db.bookings = bookings;
  writeDb(db);
};

export const getAdmins = () => readDb().admins;

export const setAdmins = (ids: number[]) => {
  const db = readDb();
  db.admins = ids.map((id) => ({ id }));
  writeDb(db);
};

export const upsertEvent = (event: EventData) => {
  const db = readDb();
  const idx = db.events.findIndex((e) => e.id === event.id);
  if (idx >= 0) {
    db.events[idx] = event;
  } else {
    db.events.push(event);
  }
  writeDb(db);
};

export const findEventById = (id: string): EventData | undefined => {
  const ev = readDb().events.find((e) => e.id === id);
  return ev ? normalizeEventStatus(ev) : undefined;
};

export const addBooking = (booking: Booking) => {
  const db = readDb();
  db.bookings.push(booking);
  writeDb(db);
};

export const updateBookingStatus = (bookingId: string, status: BookingStatus) => {
  const db = readDb();
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (booking) {
    booking.status = status;
    writeDb(db);
  }
  return booking;
};

export const updateBookingTickets = (bookingId: string, tickets: Ticket[]) => {
  const db = readDb();
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (booking) {
    booking.tickets = tickets;
    writeDb(db);
  }
};
