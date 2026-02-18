-- Change event_tables coordinate/percent columns from INTEGER to NUMERIC
-- Run in Supabase SQL Editor
-- Required for fractional coordinates (e.g. 50.5) from frontend

ALTER TABLE event_tables
ALTER COLUMN center_x TYPE NUMERIC USING center_x::numeric;

ALTER TABLE event_tables
ALTER COLUMN center_y TYPE NUMERIC USING center_y::numeric;

-- If width_percent and height_percent are INTEGER, uncomment and run:
-- ALTER TABLE event_tables
-- ALTER COLUMN width_percent TYPE NUMERIC USING width_percent::numeric;

-- ALTER TABLE event_tables
-- ALTER COLUMN height_percent TYPE NUMERIC USING height_percent::numeric;
