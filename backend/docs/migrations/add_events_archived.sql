-- "Archived" was set in code but never stored: the only column was `published`,
-- so an archived event came back as a draft on the next read.
alter table public.events add column if not exists archived boolean not null default false;
