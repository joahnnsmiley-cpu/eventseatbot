-- Add label_font_size column to event_tables
-- Run in Supabase SQL Editor

ALTER TABLE event_tables
ADD COLUMN IF NOT EXISTS label_font_size INTEGER;

COMMENT ON COLUMN event_tables.label_font_size IS 'Custom font size in px for the table number label. NULL = auto (CSS container queries).';
