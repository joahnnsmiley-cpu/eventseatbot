-- Add total_amount column to bookings (Supabase)
-- Run in Supabase SQL Editor for existing DB

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0;

COMMENT ON COLUMN bookings.total_amount IS 'Total price in rubles for the booking';
