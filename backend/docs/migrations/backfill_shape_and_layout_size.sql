-- Step 1 of the audit remediation: make an object's shape explicit, and remember
-- the dimensions of the layout image a hall was drawn on.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Read the whole file before running. Section 1 rewrites existing rows.

-- ---------------------------------------------------------------------------
-- 1. event_tables.shape must never be NULL
-- ---------------------------------------------------------------------------
-- A row with shape = NULL was rendered as a circle regardless of its width and
-- height, so a 40x8 stage came out round. Backfill from the geometry, then
-- forbid NULL so it cannot happen again.

-- How many rows are affected — run this first and look at the numbers.
SELECT
  count(*) FILTER (WHERE shape IS NULL)                                   AS null_shape,
  count(*) FILTER (WHERE shape IS NULL AND width_percent IS DISTINCT FROM height_percent) AS null_becomes_rect,
  count(*) FILTER (WHERE shape IS NULL AND width_percent IS NOT DISTINCT FROM height_percent) AS null_becomes_circle,
  count(*)                                                                AS total_rows
FROM event_tables;

-- Backfill: differing dimensions mean a rectangle; anything else is a circle.
UPDATE event_tables
SET shape = CASE
  WHEN width_percent IS NOT NULL
   AND height_percent IS NOT NULL
   AND abs(width_percent - height_percent) > 0.01 THEN 'rect'
  ELSE 'circle'
END
WHERE shape IS NULL;

-- Decorative objects are rectangles unless they were explicitly drawn round.
UPDATE event_tables
SET shape = 'rect'
WHERE object_type IN ('stage', 'bar', 'wall', 'passage')
  AND shape = 'circle'
  AND width_percent IS NOT NULL
  AND height_percent IS NOT NULL
  AND abs(width_percent - height_percent) > 0.01;

ALTER TABLE event_tables
  ALTER COLUMN shape SET DEFAULT 'circle';

ALTER TABLE event_tables
  ALTER COLUMN shape SET NOT NULL;

-- Only two shapes exist in the model; reject anything else at the door.
ALTER TABLE event_tables
  DROP CONSTRAINT IF EXISTS event_tables_shape_check;
ALTER TABLE event_tables
  ADD CONSTRAINT event_tables_shape_check CHECK (shape IN ('circle', 'rect'));

COMMENT ON COLUMN event_tables.shape IS
  'circle | rect. Never NULL: a NULL used to render every object as a circle.';

-- ---------------------------------------------------------------------------
-- 2. events: remember the layout image dimensions
-- ---------------------------------------------------------------------------
-- Table positions are percentages of the layout image. Nothing recorded which
-- image they were measured against, so uploading a plan with different
-- proportions silently moved every table. Storing the dimensions lets the
-- admin be asked whether to rescale, and lets the map size its container
-- before the image has loaded instead of guessing 16:9.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS layout_width  INTEGER,
  ADD COLUMN IF NOT EXISTS layout_height INTEGER;

COMMENT ON COLUMN events.layout_width IS
  'Natural pixel width of layout_image_url. Table coordinates are percentages of it.';
COMMENT ON COLUMN events.layout_height IS
  'Natural pixel height of layout_image_url.';

-- Existing events have no recorded dimensions. They stay NULL: the frontend
-- keeps measuring the image on load, exactly as it does today. The values get
-- filled in on the next layout upload.

-- ---------------------------------------------------------------------------
-- 3. Verify
-- ---------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE shape IS NULL)      AS should_be_zero,
  count(*) FILTER (WHERE shape = 'rect')     AS rects,
  count(*) FILTER (WHERE shape = 'circle')   AS circles,
  count(*)                                   AS total
FROM event_tables;
