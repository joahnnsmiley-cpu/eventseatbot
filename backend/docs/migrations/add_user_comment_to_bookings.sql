-- Add user_comment column to bookings (Supabase)
-- Run in Supabase SQL Editor for existing DB

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS user_comment TEXT;
