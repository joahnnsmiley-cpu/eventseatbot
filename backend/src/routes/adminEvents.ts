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

// Simple Event shape for admin CRUD
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

const toEvent = (e: EventData): Event => ({ id: e.id, title: e.title, description: e.description, date: e.date });

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

    return table;
  });
};

// GET /admin/events
router.get('/events', async (_req: Request, res: Response) => {
  const events = (await db.getEvents()).map(toEvent);
  res.json(events);
});

// GET /admin/events/:id
router.get('/events/:id', async (req: Request, res: Response) => {
  const id = normalizeId(req.params.id);

  if (!id) {
    return respondBadRequest(res, new Error('Event id is required'), { error: 'Event id is required' });
  }

  const existing = await db.findEventById(id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  // Allow admin to read events regardless of status.
  res.json(existing);
});

// POST /admin/events
router.post('/events', async (req: Request, res: Response) => {
  const id = uuid();
  const title = typeof req.body.title === 'string' ? req.body.title : '';
  const description = typeof req.body.description === 'string' ? req.body.description : '';
  const date = typeof req.body.date === 'string' ? req.body.date : new Date().toISOString();
  const newEvent: Event = { id, title, description, date };
  const coverImageUrl = typeof req.body.coverImageUrl === 'string' ? req.body.coverImageUrl : undefined;
  const imageUrl = typeof req.body.imageUrl === 'string' ? req.body.imageUrl : coverImageUrl || '';
  const schemaImageUrl = typeof req.body.schemaImageUrl === 'string' ? req.body.schemaImageUrl : undefined;
  const layoutImageUrl = typeof req.body.layoutImageUrl === 'string' ? req.body.layoutImageUrl : undefined;
  const published = typeof req.body.published === 'boolean' ? req.body.published : false;

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
    tables: normalizeTables(req.body.tables),
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

  if (existing.status && existing.status !== 'draft') {
    return res.status(409).json({ error: 'Event cannot be published from current status' });
  }

  existing.status = 'published';
  existing.published = true;
  await db.upsertEvent(existing);
  return res.status(200).json(existing);
});

// PUT /admin/events/:id
router.put('/events/:id', async (req: Request, res: Response) => {
  const id = normalizeId(req.params.id);

  if (!id) {
    return respondBadRequest(res, new Error('Event id is required'), { error: 'Event id is required' });
  }
  const existing = await db.findEventById(id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });
  // Allow publishing the event via status change from draft -> published
  const requestedStatus = typeof req.body.status === 'string' ? req.body.status : undefined;

  if (requestedStatus === 'published' && existing.status === 'draft') {
    existing.status = 'published';
    await db.upsertEvent(existing);
    return res.json(toEvent(existing));
  }

  // Once published, the event must not be modified
  if (existing.status === 'published') {
    return res.status(403).json({ error: 'Event is published and cannot be modified' });
  }

  if (typeof req.body.title === 'string') existing.title = req.body.title;
  if (typeof req.body.description === 'string') existing.description = req.body.description;
  if (typeof req.body.date === 'string') existing.date = req.body.date;
  // allow optional other fields to be updated if provided
  if (typeof req.body.imageUrl === 'string') existing.imageUrl = req.body.imageUrl;
  if (typeof req.body.coverImageUrl === 'string') existing.imageUrl = req.body.coverImageUrl;
  if (typeof req.body.schemaImageUrl === 'string') existing.schemaImageUrl = req.body.schemaImageUrl;
  if (req.body.layoutImageUrl === null || typeof req.body.layoutImageUrl === 'string') {
    existing.layoutImageUrl = req.body.layoutImageUrl;
  }
  if (typeof req.body.published === 'boolean') existing.published = req.body.published;
  if (typeof req.body.paymentPhone === 'string') existing.paymentPhone = req.body.paymentPhone;
  if (typeof req.body.maxSeatsPerBooking !== 'undefined') existing.maxSeatsPerBooking = Number(req.body.maxSeatsPerBooking) || 0;
  if (Array.isArray(req.body.tables)) existing.tables = normalizeTables(req.body.tables);

  await db.upsertEvent(existing);
  res.json(toEvent(existing));
});

// DELETE /admin/events/:id
router.delete('/events/:id', async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const events = await db.getEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  const existing = events[idx];
  if ((existing as any).status === 'published') return res.status(403).json({ error: 'Event is published and cannot be deleted' });
  events.splice(idx, 1);
  await db.saveEvents(events);
  res.json({ ok: true });
});

export default router;
