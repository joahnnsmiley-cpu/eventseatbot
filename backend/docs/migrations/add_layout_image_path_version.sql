-- Add layout_image_path and layout_image_version to events table
-- Run in Supabase SQL Editor

ALTER TABLE events
ADD COLUMN IF NOT EXISTS layout_image_path TEXT,
ADD COLUMN IF NOT EXISTS layout_image_version INTEGER DEFAULT 0;

COMMENT ON COLUMN events.layout_image_path IS 'Storage path within layouts bucket (e.g. events/ev123/v1-123.png)';
COMMENT ON COLUMN events.layout_image_version IS 'Version counter for layout image (incremented on each upload)';
