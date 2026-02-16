-- Add poster_image_path and poster_image_version to events table
-- Run in Supabase SQL Editor
--
-- Also create "posters" storage bucket: npx ts-node backend/scripts/create-posters-bucket.ts

ALTER TABLE events
ADD COLUMN IF NOT EXISTS poster_image_path TEXT,
ADD COLUMN IF NOT EXISTS poster_image_version INTEGER DEFAULT 1;

COMMENT ON COLUMN events.poster_image_path IS 'Storage path within posters bucket (e.g. events/ev123/v1-123.jpg)';
COMMENT ON COLUMN events.poster_image_version IS 'Version counter for poster image (incremented on each upload)';
