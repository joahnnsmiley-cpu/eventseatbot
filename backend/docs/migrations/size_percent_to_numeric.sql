-- Table width can be 3.5% of the plan; size_percent (legacy single dimension)
-- was integer, so saving a fractional width failed with:
--   invalid input syntax for type integer: "3.5"
alter table public.event_tables alter column size_percent type numeric using size_percent::numeric;
