import { Router, Request, Response } from 'express';
import { getEvents, findEventById } from '../db';
import { getBookings, updateBookingStatus, saveEvents, addBooking } from '../db';
import { emitBookingCreated, emitBookingCancelled, calculateBookingExpiration } from '../domain/bookings';

const router = Router();

// Return published events only
router.get('/events', (_req: Request, res: Response) => {
  try {
    const events = getEvents().filter((e: any) => (e as any).published === true || (e as any).status === 'published');
    // map to safe public shape
    const mapped = events.map((e: any) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.date,
      coverImageUrl: e.imageUrl || e.schemaImageUrl || null,
      schemaImageUrl: e.schemaImageUrl || e.imageUrl || null,
      tables: Array.isArray(e.tables) ? e.tables : [],
    }));
    return res.json(mapped ?? []);
  } catch (err) {
    console.error('[PublicEvents] Failed to load events:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Return a single published event
router.get('/events/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const ev = findEventById(id as string) as any;
  if (!ev || (ev.published !== true && ev.status !== 'published')) return res.status(404).json({ error: 'Event not found' });
  const mapped = {
    id: ev.id,
    title: ev.title,
    description: ev.description,
    date: ev.date,
    coverImageUrl: ev.imageUrl || ev.schemaImageUrl || null,
    schemaImageUrl: ev.schemaImageUrl || ev.imageUrl || null,
    tables: Array.isArray(ev.tables) ? ev.tables : [],
  };
  res.json(mapped);
});

// Simple static HTML view for event list (public)
router.get('/view', (_req: Request, res: Response) => {
  res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Events</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:16px;background:#f7fafc}
    .card{position:relative;width:100%;max-width:800px;margin:12px auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)}
    .card .cover{height:200px;background-size:cover;background-position:center}
    .card .meta{padding:12px;background:white}
    .link{display:block;text-decoration:none;color:inherit}
  </style>
</head>
<body>
  <h1>Events</h1>
  <div id="list"></div>
  <script>
    async function load(){
      try{
        const res = await fetch('/public/events');
        const data = await res.json();
        const container = document.getElementById('list');
        data.forEach(ev=>{
          const a = document.createElement('a');
          a.href = '/public/view/'+ev.id;
          a.className='link';
          a.innerHTML = '<div class="card"><div class="cover" style="background-image:url("' + (ev.coverImageUrl || '') + '")"></div><div class="meta"><h3>' + (ev.title || '') + '</h3><p>' + (ev.description || '') + '</p></div></div>';
          container.appendChild(a);
        });
      }catch(e){document.getElementById('list').innerText='Failed to load events';}
    }
    load();
  </script>
</body>
</html>
`);
});

// Simple static HTML view for event detail (renders schema image and overlays)
router.get('/view/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Event</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;background:#fff}
    .hero{position:relative;width:100%;height:80vh;background:#eee;display:flex;align-items:center;justify-content:center}
    .hero img{max-width:100%;max-height:100%;display:block}
    .overlay{position:absolute;pointer-events:none}
    .table{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;background:rgba(59,130,246,0.9);color:white;border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-weight:bold;cursor:pointer}
    .info{position:fixed;left:16px;top:16px;background:rgba(255,255,255,0.95);padding:8px;border-radius:8px}
  </style>
</head>
<body>
  <div class="info"><a href="/public/view">Back</a></div>
  <div class="hero"><img id="schema" src="" alt="schema"/><div id="overlay" class="overlay"></div></div>
  <script>
    async function load(){
      try{
        const res = await fetch('/public/events/${encodeURIComponent(id)}');
        if(!res.ok){document.body.innerText='Event not found';return}
        const ev = await res.json();
        const img = document.getElementById('schema');
        const overlay = document.getElementById('overlay');
        img.src = ev.schemaImageUrl || '';
        img.onload = ()=>{
          // place overlays
          overlay.style.width = img.clientWidth+'px';
          overlay.style.height = img.clientHeight+'px';
          overlay.style.left = img.offsetLeft+'px';
          overlay.style.top = img.offsetTop+'px';
        };
        // create table elements
        (ev.tables || []).forEach(t=>{
          const d = document.createElement('div');
          d.className='table';
          d.style.left = t.centerX + '%';
          d.style.top = t.centerY + '%';
          d.textContent = t.number;
          d.title = 'Table '+t.number;
          d.addEventListener('click', ()=>{
            alert('Table '+t.number+' — Available: '+t.seatsAvailable+' / '+t.seatsTotal);
          });
          overlay.appendChild(d);
        });
      }catch(e){document.body.innerText='Failed to load event';}
    }
    load();
  </script>
</body>
</html>
`);
});

export default router;

// POST /public/bookings/table
// Create a reserved booking for a table (public read-only booking endpoint)
// Body: { eventId, tableId, seatsRequested }
router.post('/bookings/table', async (req: Request, res: Response) => {
  const { eventId, tableId, seatsRequested, userPhone } = req.body || {};
  if (!eventId || !tableId) return res.status(400).json({ error: 'eventId and tableId are required' });
  const normalizedUserPhone = typeof userPhone === 'string' ? userPhone.trim() : '';
  if (!normalizedUserPhone) return res.status(400).json({ error: 'userPhone is required' });
  const seats = Number(seatsRequested) || 0;
  if (!Number.isFinite(seats) || seats <= 0) return res.status(400).json({ error: 'seatsRequested must be a positive number' });

  // simple per-event async lock to prevent concurrent oversells
  const locks: Map<string, Promise<void>> = (router as any).__locks || new Map();
  (router as any).__locks = locks;

  const runWithLock = async <T,>(key: string, fn: () => Promise<T>) => {
    const prev = locks.get(key) || Promise.resolve();
    let release: () => void = () => {};
    const next = new Promise<void>((r) => { release = r; });
    locks.set(key, prev.then(() => next));
    try {
      await prev;
      return await fn();
    } finally {
      release();
      if (locks.get(key) === next) locks.delete(key);
    }
  };

  try {
    const result = await runWithLock(eventId, async () => {
      const events = getEvents();
      const ev = events.find((e: any) => e.id === eventId);
      if (!ev) return { status: 404, body: { error: 'Event not found' } };
      if (ev.status !== 'published') return { status: 403, body: { error: 'Event is not published' } };
      const tbl = Array.isArray(ev.tables) ? ev.tables.find((t: any) => t.id === tableId) : null;
      if (!tbl) return { status: 400, body: { error: 'Table not found' } };
      if (typeof tbl.seatsAvailable !== 'number') tbl.seatsAvailable = Number(tbl.seatsAvailable) || 0;
      if (tbl.seatsAvailable < seats) return { status: 409, body: { error: 'Not enough seats available' } };

      // decrement
      tbl.seatsAvailable = Math.max(0, tbl.seatsAvailable - seats);
      // persist
      // saveEvents expects full events array
      const saveable = events;
      saveEvents(saveable);

      // create booking record
      const createdAtMs = Date.now();
      const booking = {
        id: (require('uuid').v4)(),
        eventId,
        tableId,
        seatsBooked: seats,
        status: 'reserved',
        createdAt: createdAtMs,
        expiresAt: calculateBookingExpiration(createdAtMs), // Set expiration for reserved bookings
        userPhone: normalizedUserPhone,
      } as any;

      try { addBooking(booking); } catch {}

      // Emit booking created event (fire-and-forget)
      emitBookingCreated({
        bookingId: booking.id,
        eventId: booking.eventId,
        seats: booking.seatsBooked,
      }).catch(() => {}); // Already handled in emitter

      return { status: 201, body: booking };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /public/bookings/:id/cancel
// Cancel a reserved booking and restore seatsAvailable on the related table.
router.post('/bookings/:id/cancel', async (req: Request, res: Response) => {
  const bookingId = String(req.params.id);
  if (!bookingId) return res.status(400).json({ error: 'bookingId is required' });

  // reuse same locks map as bookings creation
  const locks: Map<string, Promise<void>> = (router as any).__locks || new Map();
  (router as any).__locks = locks;

  const runWithLock = async <T,>(key: string, fn: () => Promise<T>) => {
    const prev = locks.get(key) || Promise.resolve();
    let release: () => void = () => {};
    const next = new Promise<void>((r) => { release = r; });
    locks.set(key, prev.then(() => next));
    try {
      await prev;
      return await fn();
    } finally {
      release();
      if (locks.get(key) === next) locks.delete(key);
    }
  };

  try {
    // Need to find booking to get eventId
    const all = getBookings();
    const bk = all.find((b: any) => b.id === bookingId);
    if (!bk) return res.status(404).json({ error: 'Booking not found' });
    const eventId = bk.eventId;

    const result = await runWithLock(eventId, async () => {
      // re-read fresh state
      const bookings = getBookings();
      const booking = bookings.find((b: any) => b.id === bookingId);
      if (!booking) return { status: 404, body: { error: 'Booking not found' } };
      if (booking.status !== 'reserved') return { status: 409, body: { error: 'Booking is not reserved or already expired' } };

      // find event and table
      const events = getEvents();
      const ev = events.find((e: any) => e.id === booking.eventId);
      if (!ev) return { status: 500, body: { error: 'Related event not found' } };
      const tbl = Array.isArray(ev.tables) ? ev.tables.find((t: any) => t.id === booking.tableId) : null;
      if (!tbl) return { status: 500, body: { error: 'Related table not found' } };

      // increment seatsAvailable (bounded by seatsTotal)
      tbl.seatsAvailable = Math.min(tbl.seatsTotal, (Number(tbl.seatsAvailable) || 0) + (Number(booking.seatsBooked) || 0));

      // persist events first
      saveEvents(events);

      // mark booking cancelled
      const updated = updateBookingStatus(bookingId, 'expired');
      if (!updated) return { status: 500, body: { error: 'Failed to update booking status' } };

      // Emit booking cancelled event (fire-and-forget)
      emitBookingCancelled({
        bookingId: booking.id,
        eventId: booking.eventId,
        reason: 'manual',
      }).catch(() => {}); // Already handled in emitter

      return { status: 200, body: { ok: true } };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});
