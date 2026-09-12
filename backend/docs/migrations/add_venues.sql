-- Venue library: set a hall up once, reuse it for every event there.
--
-- Today every event starts from an empty hall: upload the plan, run detection,
-- then drag 35 tables into place by finger inside Telegram. The hall does not
-- change between concerts — the date and the prices do. So a hall gets saved
-- once and copied into the next event.
--
-- Objects live in jsonb rather than their own table: a venue is a template, not
-- something that gets booked. They are stored in the same shape the admin API
-- already sends for event tables, so applying a venue needs no conversion.
--
-- Run in Supabase SQL Editor. Creates a new table; touches nothing existing.

CREATE TABLE IF NOT EXISTS venues (
  id                 UUID PRIMARY KEY,
  name               TEXT NOT NULL,
  -- The plan and its pixel size, carried over so table percentages stay valid.
  layout_image_url   TEXT,
  layout_image_path  TEXT,
  layout_width       INTEGER,
  layout_height      INTEGER,
  -- Tables and decorative objects, in the admin API's wire shape.
  objects            JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Which tables belong to which category is part of the hall, not the event.
  -- Prices get edited per event; the ids have to stay stable for the mapping.
  ticket_categories  JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS venues_name_idx ON venues (name);

COMMENT ON TABLE venues IS
  'Saved hall layouts. A venue is copied into an event, never booked directly.';
COMMENT ON COLUMN venues.objects IS
  'Tables and decorative objects in the admin API wire shape (see tableToApi).';
COMMENT ON COLUMN venues.ticket_categories IS
  'Categories as saved with the hall. Ids must stay stable: objects reference them.';
