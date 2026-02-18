-- Add timezone_offset_minutes to events
-- Offset from UTC in minutes (e.g. 180 = UTC+3). Used to interpret event_date + event_time.
ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone_offset_minutes INTEGER DEFAULT 180;
COMMENT ON COLUMN events.timezone_offset_minutes IS 'Minutes ahead of UTC (e.g. 180 = UTC+3). Set via admin "current time" reference.';
