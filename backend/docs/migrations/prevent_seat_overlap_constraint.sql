-- Prevent overlapping seat_indices for same event_id + table_id (seat conflict at DB level)
-- Run in Supabase SQL Editor. Requires btree_gist and intarray extensions.
-- seat_indices is int4[] (INTEGER[]); uses && (array overlap) operator.
-- Does not drop or modify existing data.

-- Step 1: Enable extensions
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS intarray;

-- Step 2: Add exclusion constraint (idempotent)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS prevent_seat_overlap;

ALTER TABLE bookings
ADD CONSTRAINT prevent_seat_overlap
EXCLUDE USING gist (
  event_id WITH =,
  table_id WITH =,
  seat_indices gist__int_ops WITH &&
)
WHERE (status IN ('reserved','awaiting_confirmation','paid'));
