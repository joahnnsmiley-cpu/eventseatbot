# Data loss report — events disappear after restart

## 1. Where data is currently stored

- **Backend:** Single JSON file `data.json` in the backend directory.
- **Path at runtime:** `path.join(__dirname, '..', 'data.json')` → e.g. `backend/data.json` (or `dist/../data.json` when running compiled).
- **Mechanism:** Node.js `fs.readFileSync` / `fs.writeFileSync`. Every read loads the full file; every write overwrites the whole file.
- **Contents:** One object `{ events: EventData[], bookings: Booking[], admins: Admin[] }`. Tables are embedded inside each `EventData` (no separate table store).

So data **is** persisted to disk, but that disk is **ephemeral** in production.

---

## 2. Why it disappears

- **Render (and similar PaaS)** use **ephemeral filesystems**: the container’s filesystem is wiped on:
  - **Redeploy** (new build, new container)
  - **Instance restart** (crash, scaling, maintenance)
  - **Scaling / new instance** (new container, no copy of `data.json`)
- The app does **not** use in-memory-only storage; it uses a **local file**. That file is not durable across restarts because the filesystem itself is not persistent.
- “Restarting the bot restores behavior temporarily” fits: after restart you get a fresh container; `data.json` is either missing (so `ensureFile()` creates an empty `{ events: [], bookings: [], admins: [] }`) or left over from a previous run on the same container, so data appears to come back until the next redeploy/restart.

---

## 3. Proposed DB solution — PostgreSQL

**Recommendation:** Use **PostgreSQL** as the only source of truth for events, tables, and bookings. No reliance on the process filesystem.

### 3.1 Schema (events, tables, bookings)

```sql
-- Admins (Telegram chat IDs)
CREATE TABLE admins (
  id BIGINT PRIMARY KEY
);

-- Events (one row per event)
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  date TEXT NOT NULL,
  image_url TEXT,
  layout_image_url TEXT,
  schema_image_url TEXT,
  payment_phone TEXT NOT NULL,
  max_seats_per_booking INT NOT NULL DEFAULT 4,
  status TEXT DEFAULT 'draft',
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tables (belong to an event; JSON for flexible shape/color)
CREATE TABLE event_tables (
  id TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  number INT NOT NULL,
  seats_total INT NOT NULL,
  seats_available INT NOT NULL,
  x NUMERIC(5,2) NOT NULL,
  y NUMERIC(5,2) NOT NULL,
  center_x NUMERIC(5,2) NOT NULL,
  center_y NUMERIC(5,2) NOT NULL,
  size_percent NUMERIC(5,2),
  shape TEXT,
  color TEXT,
  PRIMARY KEY (event_id, id)
);

-- Bookings
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  table_id TEXT,
  user_telegram_id BIGINT DEFAULT 0,
  username TEXT DEFAULT '',
  user_phone TEXT NOT NULL,
  seat_ids JSONB DEFAULT '[]',
  seat_indices JSONB DEFAULT '[]',
  seats_booked INT DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  table_bookings JSONB
);

CREATE INDEX idx_bookings_event_id ON bookings(event_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_user_telegram_id ON bookings(user_telegram_id);
```

### 3.2 Migration path

1. **Add Postgres**  
   - Use Render Postgres (or any managed Postgres).  
   - Set `DATABASE_URL` in the backend.

2. **Implement a DB layer**  
   - Use `pg` or an ORM (e.g. Drizzle, Prisma) with the schema above.  
   - Implement the same API as current `db.ts`: `getEvents`, `getBookings`, `findEventById`, `addBooking`, `saveEvents`, `upsertEvent`, `updateBookingStatus`, `getAdmins`, `setAdmins`, etc., reading/writing Postgres instead of `data.json`.

3. **One-time migration**  
   - Script that reads existing `data.json` (if present), and inserts events, event_tables, bookings, admins into Postgres.  
   - Run once after deploy, or manually when switching.

4. **Switch backend to Postgres**  
   - Point `db.ts` (or a new `db.pg.ts`) to the Postgres implementation; keep the same exports so routes and jobs stay unchanged.

5. **Remove file dependency**  
   - Stop reading/writing `data.json` in production.  
   - Optionally keep a small “file fallback” for local dev only.

### 3.3 What not to do

- Do **not** try to make the current file storage “reliable” on Render (e.g. by syncing to an external volume or complex workarounds).
- Do **not** rely on Render’s filesystem for durable state.
- Do **not** add hacks to keep the process alive to “preserve” data; the underlying disk is still ephemeral.

---

## 4. Startup warning (implemented)

On boot, the server now logs:

- If **empty:**  
  `[Storage] Boot: storage is empty (no events, no bookings). Data is stored in a local file and will be lost on instance restart/redeploy.`
- If **not empty:**  
  `[Storage] Boot: events=N, bookings=M`

This makes it explicit in logs when the current storage is empty and that the file is not persistent across restarts.
