-- Add is_used flag to bookings (for ticket verification)
-- Run in Supabase SQL Editor
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_used BOOLEAN DEFAULT false;

COMMENT ON COLUMN bookings.is_used IS 'Whether ticket has been used/verified at entry';
