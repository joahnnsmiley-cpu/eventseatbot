-- Add is_featured to events (only one featured event at a time; enforced in app logic)
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
