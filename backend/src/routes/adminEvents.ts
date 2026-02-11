import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';
import { db } from '../db';
import type { EventData } from '../models';

/*
  ADMIN DOMAIN: FROZEN

  NOTE: The admin CRUD surface (routes under /admin) including the
  publish-lock behavior is considered complete and frozen. Do NOT make
  additional changes to admin business logic without explicit review.

  Rationale / source-of-truth:
  - Backend persistence smoke test: backend/scripts/persist-smoke.js
  - Publish-lock integration test: tests/publish-lock.spec.ts

  If you need to evolve admin behavior, update the tests above first
  and get explicit approval before changing the routes in this folder.
*/

// Simple Event shape for admin CRUD (PUT response only — no tables).
// Frontend must NOT use PUT /admin/events/:id response as EventData; use GET to get full event including tables.
export interface Event {
  id: string;
  title: string;
  description: string;
  date: string; // ISO date
}

const router = Router();

// Protect all admin event routes
router.use(authMiddleware, adminOnly);

const normalizeId = (raw: string | string[] | undefined) => {
  if (Array.isArray(raw)) {
    return raw.find((v) => typeof v === 'string' && v.length > 0) || '';
  }
  if (typeof raw === 'string') return raw;
  return '';
};

const respondBadRequest = (res: Response, err: Error, payload: unknown) => {
  console.error('[ADMIN ROUTER ERROR]', err);
  return res.status(400).json(payload);
};

/** Reduced shape for PUT response only. No tables — client must GET the event to refresh full EventData. */
const toEvent = (e: EventData): Event => ({ id: e.id, title: e.title, description: e.description, date: e.date });

/** Normalize table rows to EventData.tables shape. Accepts frontend Table (id, x, y, centerX, centerY, seatsTotal, seatsAvailable, shape, sizePercent, isAvailable, color). Fills x/y from centerX/centerY and vice versa; maps seatsCount → seatsTotal when missing. */
const normalizeTables = (tables: unknown): EventData['tables'] => {
  if (!Array.isArray(tables)) return [];
  return tables.map((t) => {
    if (!t || typeof t !== 'object') return t as any;
    const table = { ...(t as any) };
    const hasX = typeof table.x === 'number' && Number.isFinite(table.x);
    const hasY = typeof table.y === 'number' && Number.isFinite(table.y);
    const hasCenterX = typeof table.centerX === 'number' && Number.isFinite(table.centerX);
    const hasCenterY = typeof table.centerY === 'number' && Number.isFinite(table.centerY);

    if (!hasX && hasCenterX) table.x = table.centerX;
    if (!hasY && hasCenterY) table.y = table.centerY;
    if (!hasCenterX && hasX) table.centerX = table.x;
    if (!hasCenterY && hasY) table.centerY = table.y;

    if (typeof table.seatsTotal !== 'number' && typeof table.seatsCount === 'number' && Number.isFinite(table.seatsCount)) {
      table.seatsTotal = table.seatsCount;
    }

    return table;
  });
};

// GET /admin/events — return full EventData[] for admin list (e.g. EventCard with layoutImageUrl, status)
router.get('/events', async (_req: Request, res: Response) => {
  const events = await db.getEvents();
  res.json(events);
});

// GET /admin/events/:id — full EventData with tables via findEventById; no filtering by published
router.get('/events/:id', async (req: Request, res: Response) => {
  const id = normalizeId(req.params.id);

  if (!id) {
    return respondBadRequest(res, new Error('Event id is required'), { error: 'Event id is required' });
  }

  const existing = await db.findEventById(id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  console.log(
    '[GET ADMIN EVENT]',
    'event_id:',
    existing.id,
    'tables length:',
    Array.isArray(existing.tables) ? existing.tables.length : 'NO TABLES',
  );

  res.json(existing);
});

// POST /admin/events
router.post('/events', async (req: Request, res: Response) => {
  const id = uuid();
  const title = typeof req.body.title === 'string' ? req.body.title : '';
  const description = typeof req.body.description === 'string' ? req.body.description : '';
  const date = typeof req.body.date === 'string' ? req.body.date : new Date().toISOString();
  const newEvent: Event = { id, title, description, date };
  // image_url — poster (event banner / cover image); not layout
  const coverImageUrl = typeof req.body.coverImageUrl === 'string' ? req.body.coverImageUrl : undefined;
  const imageUrl = typeof req.body.imageUrl === 'string' ? req.body.imageUrl : coverImageUrl || '';
  const schemaImageUrl = typeof req.body.schemaImageUrl === 'string' ? req.body.schemaImageUrl : undefined;
  // layout_image_url — seating only (рассадка)
  const layoutImageUrl = typeof req.body.layoutImageUrl === 'string' ? req.body.layoutImageUrl : undefined;
  const published = typeof req.body.published === 'boolean' ? req.body.published : false;
  const status = published ? 'published' as const : 'draft' as const;

  // Convert to EventData with sensible defaults so storage remains compatible
  const eventData: EventData = {
    id: newEvent.id,
    title: newEvent.title,
    description: newEvent.description,
    date: newEvent.date,
    imageUrl,
    schemaImageUrl,
    layoutImageUrl: typeof layoutImageUrl === 'undefined' ? null : layoutImageUrl,
    paymentPhone: req.body.paymentPhone || '',
    maxSeatsPerBooking: Number(req.body.maxSeatsPerBooking) || 0,
    tables: (() => {
      console.log('normalizeTables input', req.body.tables);
      const out = normalizeTables(req.body.tables);
      console.log('normalizeTables output', out);
      return out;
    })(),
    status,
    published,
  };

  await db.upsertEvent(eventData);
  res.status(201).json(newEvent);
});

// POST /admin/events/:id/publish
router.post('/events/:id/publish', async (req: Request, res: Response) => {
  const id = normalizeId(req.params.id);

  if (!id) {
    return respondBadRequest(res, new Error('Event id is required'), { error: 'Event id is required' });
  }
  const existing = await db.findEventById(id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  if (existing.status === 'published') {
    return res.status(409).json({ error: 'Event is already published' });
  }

  existing.status = 'published';
  existing.published = true;
  await db.upsertEvent(existing);
  return res.status(200).json(existing);
});

// POST /admin/events/:id/archive
router.post('/events/:id/archive', async (req: Request, res: Response) => {
  const id = normalizeId(req.params.id);

  if (!id) {
    return respondBadRequest(res, new Error('Event id is required'), { error: 'Event id is required' });
  }
  const existing = await db.findEventById(id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  existing.status = 'archived';
  existing.published = false;
  await db.upsertEvent(existing);
  return res.status(200).json(existing);
});

// PUT /admin/events/:id — forbid modification only when status === 'published'; allow when draft or archived
router.put('/events/:id', async (req: Request, res: Response) => {
  const id = normalizeId(req.params.id);

  if (!id) {
    return respondBadRequest(res, new Error('Event id is required'), { error: 'Event id is required' });
  }
  const existing = await db.findEventById(id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });
  if (
    Array.isArray(req.body.tables) &&
    req.body.tables.length === 0 &&
    Array.isArray(existing.tables) &&
    existing.tables.length > 0
  ) {
    return res.status(400).json({
      error: 'Empty tables payload would wipe existing tables',
    });
  }
  if (req.body.published === true && !Array.isArray(req.body.tables)) {
    return res.status(400).json({
      error: 'Publishing requires tables to be sent',
    });
  }
  // Allow publishing via status in body from draft or archived
  const requestedStatus = typeof req.body.status === 'string' ? req.body.status : undefined;

  if (requestedStatus === 'published' && (existing.status === 'draft' || existing.status === 'archived')) {
    existing.status = 'published';
    existing.published = true;
    if (Array.isArray(req.body.tables)) {
      existing.tables = normalizeTables(req.body.tables);
    }
    await db.upsertEvent(existing);
    return res.json(toEvent(existing));
  }

  // When published, only table isAvailable can be updated; other fields are readonly
  if (existing.status === 'published') {
    if (Array.isArray(req.body.tables)) {
      const tables = existing.tables ?? [];
      for (let i = 0; i < req.body.tables.length; i++) {
        const bt = req.body.tables[i];
        if (bt && typeof bt.id === 'string') {
          const idx = tables.findIndex((t: any) => t.id === bt.id);
          if (idx !== -1) {
            (tables[idx] as any).isAvailable = bt.isAvailable === true;
          }
        }
      }
      existing.tables = tables;
      await db.upsertEvent(existing);
      return res.json(toEvent(existing));
    }
    return res.status(403).json({ error: 'Event is published and cannot be modified' });
  }

  if (typeof req.body.title === 'string') existing.title = req.body.title;
  if (typeof req.body.description === 'string') existing.description = req.body.description;
  if (typeof req.body.date === 'string') existing.date = req.body.date;
  // image_url — poster (banner/cover); layout_image_url — seating only (рассадка)
  if (typeof req.body.imageUrl === 'string') existing.imageUrl = req.body.imageUrl;
  if (typeof req.body.coverImageUrl === 'string') existing.imageUrl = req.body.coverImageUrl;
  if (typeof req.body.schemaImageUrl === 'string') existing.schemaImageUrl = req.body.schemaImageUrl;
  if (req.body.layoutImageUrl === null || typeof req.body.layoutImageUrl === 'string') {
    existing.layoutImageUrl = req.body.layoutImageUrl;
  }
  if (typeof req.body.published === 'boolean') {
    existing.published = req.body.published;
    existing.status = req.body.published ? 'published' : 'draft';
  }
  const requestedStatusPut = typeof req.body.status === 'string' && (req.body.status === 'draft' || req.body.status === 'published' || req.body.status === 'archived') ? req.body.status : undefined;
  if (requestedStatusPut !== undefined) {
    existing.status = requestedStatusPut;
    existing.published = requestedStatusPut === 'published';
  }
  if (typeof req.body.paymentPhone === 'string') existing.paymentPhone = req.body.paymentPhone;
  if (typeof req.body.maxSeatsPerBooking !== 'undefined') existing.maxSeatsPerBooking = Number(req.body.maxSeatsPerBooking) || 0;
  if (Array.isArray(req.body.tables)) {
    const existingTableIds = new Set((existing.tables ?? []).map((t: any) => t.id).filter(Boolean));
    const newTableIds = new Set(req.body.tables.map((t: any) => t?.id).filter(Boolean));
    const removedTableIds = [...existingTableIds].filter((tid) => !newTableIds.has(tid));
    if (removedTableIds.length > 0) {
      const allBookings = await db.getBookings();
      const eventBookings = allBookings.filter((b: any) => b.eventId === id);
      for (const tableId of removedTableIds) {
        const hasBookings = eventBookings.some(
          (b: any) =>
            b.tableId === tableId ||
            (Array.isArray(b.tableBookings) && b.tableBookings.some((tb: any) => tb.tableId === tableId))
        );
        if (hasBookings) {
          return res.status(409).json({
            error: 'Cannot delete table: it has bookings',
          });
        }
      }
    }
    console.log('normalizeTables input', req.body.tables);
    existing.tables = normalizeTables(req.body.tables);
    console.log('normalizeTables output', existing.tables);
  }

  if (!existing.tables || existing.tables.length === 0) {
    return res.status(400).json({
      error: 'Tables normalization resulted in empty list',
    });
  }

  console.log(
    '[PUT EVENT] tables in payload:',
    Array.isArray(req.body.tables) ? req.body.tables.length : 'NO FIELD',
  );

  await db.upsertEvent(existing);
  res.json(toEvent(existing));
});

// POST /admin/resync-seats — recalculate seatsAvailable from bookings
router.post('/resync-seats', async (_req: Request, res: Response) => {
  const events = await db.getEvents();
  const bookings = await db.getBookings();

  let tablesUpdated = 0;

  for (const ev of events) {
    if (!Array.isArray(ev.tables)) continue;

    for (const table of ev.tables) {
      const activeBookings = bookings.filter(
        (b: any) =>
          b.eventId === ev.id &&
          b.tableId === table.id &&
          ['reserved', 'pending', 'awaiting_confirmation', 'paid'].includes(String(b.status ?? ''))
      );

      const bookedSeats = activeBookings.reduce(
        (sum: number, b: any) => sum + (Number(b.seatsBooked) || 0),
        0
      );

      const newAvailable = Math.max(0, Number(table.seatsTotal) - bookedSeats);

      if (table.seatsAvailable !== newAvailable) {
        table.seatsAvailable = newAvailable;
        tablesUpdated++;
      }
    }
  }

  await db.saveEvents(events);

  return res.json({
    ok: true,
    eventsProcessed: events.length,
    tablesUpdated,
  });
});

export default router;
