-- Add is_active column to event_tables (soft-delete; never delete rows)
-- Run in Supabase SQL Editor

ALTER TABLE event_tables
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

COMMENT ON COLUMN event_tables.is_active IS 'When false, table is hidden from layout but row kept for historical bookings';
