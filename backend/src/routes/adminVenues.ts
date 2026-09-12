/**
 * Venue library.
 *
 * A hall gets set up once — detection first, then the coordinates corrected by
 * hand — and saved. The next event at the same place starts from that snapshot
 * instead of an empty plan.
 *
 * Objects are stored in the same wire shape the admin API already accepts for
 * event tables, so applying a venue is a copy, not a conversion.
 */
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';
import { supabase } from '../supabaseClient';
import { db } from '../db';

const router = Router();

type VenueRow = {
  id: string;
  name: string;
  layout_image_url: string | null;
  layout_image_path: string | null;
  layout_width: number | null;
  layout_height: number | null;
  objects: unknown;
  ticket_categories: unknown;
  created_at?: string;
  updated_at?: string;
};

function rowToVenue(row: VenueRow) {
  const objects = Array.isArray(row.objects) ? row.objects : [];
  return {
    id: row.id,
    name: row.name,
    layoutImageUrl: row.layout_image_url,
    layoutImagePath: row.layout_image_path,
    layoutWidth: row.layout_width,
    layoutHeight: row.layout_height,
    objects,
    ticketCategories: Array.isArray(row.ticket_categories) ? row.ticket_categories : [],
    tableCount: objects.filter((o: any) => (o?.objectType ?? 'table') === 'table').length,
    seatCount: objects.reduce(
      (n: number, o: any) => n + ((o?.objectType ?? 'table') === 'table' ? Number(o?.seatsTotal) || 0 : 0),
      0
    ),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * A venue keeps the hall, not the sales state. Seat availability, visibility
 * windows and row ids belong to the event that was snapshotted, and carrying
 * them over would make the copy look half-booked before it opens.
 */
function toVenueObject(table: any) {
  return {
    number: table.number,
    centerX: table.centerX ?? table.center_x ?? table.x,
    centerY: table.centerY ?? table.center_y ?? table.y,
    widthPercent: table.widthPercent ?? table.width_percent,
    heightPercent: table.heightPercent ?? table.height_percent,
    sizePercent: table.sizePercent ?? table.size_percent,
    rotationDeg: table.rotationDeg ?? table.rotation_deg ?? 0,
    seatsTotal: table.seatsTotal ?? table.seats_total ?? 0,
    ticketCategoryId: table.ticketCategoryId ?? table.ticket_category_id ?? null,
    isAvailable: table.isAvailable !== false,
    shape: table.shape === 'rect' ? 'rect' : 'circle',
    objectType: table.objectType ?? table.object_type ?? 'table',
    label: table.label ?? null,
    labelFontSize: table.labelFontSize ?? table.label_font_size ?? null,
  };
}

/** GET /admin/venues — saved halls, newest first. */
router.get('/venues', authMiddleware, adminOnly, async (_req: Request, res: Response) => {
  if (!supabase) return res.status(503).json({ error: 'Storage not configured' });
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[adminVenues] list', error);
    return res.status(500).json({ error: 'Failed to load venues' });
  }
  res.json((data ?? []).map((r) => rowToVenue(r as VenueRow)));
});

/**
 * POST /admin/venues — save an event's hall as a reusable venue.
 * Body: { name, fromEventId }
 */
router.post('/venues', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  if (!supabase) return res.status(503).json({ error: 'Storage not configured' });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const fromEventId = typeof req.body?.fromEventId === 'string' ? req.body.fromEventId.trim() : '';
  if (!name) return res.status(400).json({ error: 'Укажите название зала' });
  if (!fromEventId) return res.status(400).json({ error: 'fromEventId is required' });

  // true = include decorative objects: the stage, the bar and the dance floor
  // are part of the hall and must travel with it.
  const event = await db.findEventById(fromEventId, true);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const objects = (event.tables ?? []).map(toVenueObject);
  if (objects.length === 0) {
    return res.status(400).json({ error: 'В этом событии ещё нет столов — нечего сохранять' });
  }

  const { data: eventRow } = await supabase
    .from('events')
    .select('layout_image_url, layout_image_path, layout_width, layout_height')
    .eq('id', fromEventId)
    .maybeSingle();

  const id = uuid();
  const { error } = await supabase.from('venues').insert({
    id,
    name,
    layout_image_url: eventRow?.layout_image_url ?? null,
    layout_image_path: eventRow?.layout_image_path ?? null,
    layout_width: eventRow?.layout_width ?? null,
    layout_height: eventRow?.layout_height ?? null,
    objects,
    ticket_categories: (event as any).ticketCategories ?? null,
  });

  if (error) {
    console.error('[adminVenues] create', error);
    return res.status(500).json({ error: 'Failed to save venue' });
  }

  res.status(201).json({ id, name, tableCount: objects.length });
});

/** PATCH /admin/venues/:id — rename. */
router.patch('/venues/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  if (!supabase) return res.status(503).json({ error: 'Storage not configured' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Укажите название зала' });
  const { error } = await supabase
    .from('venues')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', String(req.params.id));
  if (error) {
    console.error('[adminVenues] rename', error);
    return res.status(500).json({ error: 'Failed to rename venue' });
  }
  res.json({ ok: true });
});

/** DELETE /admin/venues/:id — events already created from it are unaffected. */
router.delete('/venues/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  if (!supabase) return res.status(503).json({ error: 'Storage not configured' });
  const { error } = await supabase.from('venues').delete().eq('id', String(req.params.id));
  if (error) {
    console.error('[adminVenues] delete', error);
    return res.status(500).json({ error: 'Failed to delete venue' });
  }
  res.json({ ok: true });
});

/**
 * GET /admin/venues/:id/apply-payload — the venue as an event update body.
 *
 * The admin panel merges this into the event it is editing and saves through
 * the existing PUT, so applying a hall goes through the same validation and
 * publish-lock as any other layout change rather than round a side door.
 */
router.get('/venues/:id/apply-payload', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  if (!supabase) return res.status(503).json({ error: 'Storage not configured' });
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('id', String(req.params.id))
    .maybeSingle();
  if (error) {
    console.error('[adminVenues] apply-payload', error);
    return res.status(500).json({ error: 'Failed to load venue' });
  }
  if (!data) return res.status(404).json({ error: 'Venue not found' });

  const venue = rowToVenue(data as VenueRow);
  res.json({
    name: venue.name,
    layoutImageUrl: venue.layoutImageUrl,
    layoutWidth: venue.layoutWidth,
    layoutHeight: venue.layoutHeight,
    ticketCategories: venue.ticketCategories,
    // Fresh ids: these become new rows in the target event, not references to
    // the tables of whatever event the hall was snapshotted from.
    tables: venue.objects.map((o: any) => ({ ...o, id: undefined })),
  });
});

export default router;
