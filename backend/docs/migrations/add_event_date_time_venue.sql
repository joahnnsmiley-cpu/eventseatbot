-- Add event_date, event_time, venue to events table
-- Run in Supabase SQL Editor

ALTER TABLE events
ADD COLUMN IF NOT EXISTS event_date DATE,
ADD COLUMN IF NOT EXISTS event_time TIME,
ADD COLUMN IF NOT EXISTS venue TEXT;

COMMENT ON COLUMN events.event_date IS 'Event date (YYYY-MM-DD)';
COMMENT ON COLUMN events.event_time IS 'Event time (HH:mm:ss)';
COMMENT ON COLUMN events.venue IS 'Venue / location name';
