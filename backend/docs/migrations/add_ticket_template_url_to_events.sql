-- Add ticket_template_url to events (PNG template for ticket generation)
-- Run in Supabase SQL Editor
-- Also create "ticket-templates" storage bucket: npm run storage:create-ticket-templates-bucket

ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_template_url TEXT;

COMMENT ON COLUMN events.ticket_template_url IS 'Public URL of ticket template image in storage (ticket-templates bucket)';
