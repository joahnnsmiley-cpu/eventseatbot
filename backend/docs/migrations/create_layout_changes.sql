-- Layout audit log: records table create/update/deactivate actions
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS layout_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_data JSONB,
  new_data JSONB,
  admin_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_layout_changes_event_id ON layout_changes(event_id);
CREATE INDEX IF NOT EXISTS idx_layout_changes_created_at ON layout_changes(created_at);

COMMENT ON TABLE layout_changes IS 'Audit log for layout table changes: create, update (seats_total), deactivate';
