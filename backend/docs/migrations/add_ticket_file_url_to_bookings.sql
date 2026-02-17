-- Add ticket_file_url to bookings (PNG ticket image URL after confirmation)
-- Run in Supabase SQL Editor
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ticket_file_url TEXT;

COMMENT ON COLUMN bookings.ticket_file_url IS 'Public URL of generated ticket PNG in storage';
