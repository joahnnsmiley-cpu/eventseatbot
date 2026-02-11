-- Add visibility window columns to event_tables
-- Tables are shown to public only when: is_active AND (visible_from <= now) AND (visible_until >= now)
-- Run in Supabase SQL Editor

ALTER TABLE event_tables
ADD COLUMN IF NOT EXISTS visible_from TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS visible_until TIMESTAMPTZ;

COMMENT ON COLUMN event_tables.visible_from IS 'When to start showing table to public; NULL = no start limit';
COMMENT ON COLUMN event_tables.visible_until IS 'When to stop showing table to public; NULL = no end limit';
