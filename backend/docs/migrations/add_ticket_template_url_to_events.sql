-- Add ticket_template_url to events (PNG template for ticket generation)
-- Run in Supabase SQL Editor
-- Templates stored in tickets bucket at path: ticket-templates/{eventId}.png

ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_template_url TEXT;

COMMENT ON COLUMN events.ticket_template_url IS 'Public URL of ticket template image (tickets bucket, ticket-templates/ folder)';
