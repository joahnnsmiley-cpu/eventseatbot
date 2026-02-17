-- Add total_amount column to bookings (Supabase)
-- REQUIRED: Run this in Supabase SQL Editor if column is missing.
-- total_amount is set at creation time and never updated (immutable).

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN bookings.total_amount IS 'Total price in rubles for the booking (set at creation, immutable)';
