-- =============================================================================
-- Supabase / PostgreSQL schema — mirrors data.json (events, tables, bookings, admins)
-- Run this in the Supabase SQL editor to create tables. No RLS, triggers, or payments.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- admins: Telegram users allowed to access admin panel (JWT + admin list)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE admins IS 'Telegram chat IDs with admin access';

-- -----------------------------------------------------------------------------
-- events: one row per event (gala, concert, etc.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  date TIMESTAMPTZ,
  image_url TEXT,           -- poster (event banner / cover image); not used as layout
  layout_image_url TEXT,    -- seating map only (рассадка); not for poster/cover
  organizer_phone TEXT,
  published BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE events IS 'Events; tables are normalized in event_tables and read via join in findEventById';
COMMENT ON COLUMN events.image_url IS 'Poster (event banner / cover image); not layout';
COMMENT ON COLUMN events.layout_image_url IS 'Seating map only (рассадка); not for poster/cover';

-- -----------------------------------------------------------------------------
-- event_tables: tables belonging to an event (seats layout)
-- Tables are in a separate table (not embedded in events) so we can query,
-- index, and reference them from bookings; same structure as data.json tables array.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_tables (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  seats_total INTEGER NOT NULL,
  seats_available INTEGER NOT NULL,
  x INTEGER,
  y INTEGER,
  center_x INTEGER,
  center_y INTEGER,
  size_percent INTEGER,
  width_percent REAL,
  height_percent REAL,
  rotation_deg INTEGER,
  shape TEXT,
  color TEXT,
  is_available BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE event_tables IS 'Tables per event; separated from events so bookings can reference table_id and we can index by event_id';
COMMENT ON COLUMN event_tables.shape IS 'e.g. circle | rect';
COMMENT ON COLUMN event_tables.width_percent IS 'For rect: width as % of container. Must be > 0 when shape=rect';
COMMENT ON COLUMN event_tables.height_percent IS 'For rect: height as % of container. Must be > 0 when shape=rect';
COMMENT ON COLUMN event_tables.rotation_deg IS 'Rotation in degrees (-180 to 180)';

-- Migration: add rect geometry columns (run in SQL Editor for existing DB)
-- ALTER TABLE event_tables ADD COLUMN IF NOT EXISTS width_percent REAL;
-- ALTER TABLE event_tables ADD COLUMN IF NOT EXISTS height_percent REAL;
-- ALTER TABLE event_tables ADD COLUMN IF NOT EXISTS rotation_deg INTEGER;

CREATE INDEX IF NOT EXISTS idx_event_tables_event_id ON event_tables(event_id);

-- -----------------------------------------------------------------------------
-- bookings: one row per booking (pending, confirmed, cancelled)
-- seat_indices is an array of seat positions at the table (e.g. [0, 1, 2])
-- so we know which seats are taken without storing per-seat rows.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  table_id TEXT REFERENCES event_tables(id) ON DELETE CASCADE,
  user_telegram_id BIGINT,
  user_phone TEXT,
  user_comment TEXT,
  seat_indices INTEGER[],
  seats_booked INTEGER,
  total_amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL,
  tickets JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

COMMENT ON TABLE bookings IS 'Bookings; status: pending | confirmed | cancelled (plus reserved | paid | expired | awaiting_confirmation in app)';
COMMENT ON COLUMN bookings.seat_indices IS 'Array of seat indices at the table (e.g. [0,1,2]); avoids per-seat rows while recording which seats are booked';
COMMENT ON COLUMN bookings.user_comment IS 'Optional user comment (e.g. for payment reference)';

-- Migration: add user_comment if missing (run in SQL Editor for existing DB)
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_comment TEXT;

-- Migration: add tickets JSONB for confirmed bookings (run in SQL Editor for existing DB)
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tickets JSONB;

CREATE INDEX IF NOT EXISTS idx_bookings_event_id ON bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_table_id ON bookings(table_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- -----------------------------------------------------------------------------
-- Tables are normalized: stored in event_tables, read via join in findEventById.
-- If events had a tables JSONB column, drop it: ALTER TABLE events DROP COLUMN IF EXISTS tables;
