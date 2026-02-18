-- Add organizer_id to events (Telegram user ID of event organizer).
-- When set: user.id === event.organizer_id → user is organizer for this event.
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_id BIGINT;
COMMENT ON COLUMN events.organizer_id IS 'Telegram user ID of event organizer; used for role resolution in profile';
